// Mode Stripe (true = production, false = test)
const STRIPE_MODE = true;

// Configuration des modules requis
require('dotenv').config();
const express = require('express');
const stripe = require('stripe')(
  STRIPE_MODE
    ? process.env.STRIPE_LIVE_SECRET_KEY
    : process.env.STRIPE_TEST_SECRET_KEY
);
const cors = require('cors');
const nodemailer = require('nodemailer');
const mongoose = require('mongoose');
const crypto = require('crypto');
// Import du modèle MongoDB
const ActivationKey = require('./models/ActivationKey');

// Configuration de l'application Express
const app = express();
app.use(express.json());
app.use(cors());

// Connexion à MongoDB
mongoose
  .connect(process.env.MONGODB_URI, {
    useNewUrlParser: true,
    useUnifiedTopology: true,
  })
  .then(() => {
    console.log('Connecté à MongoDB avec succès');
  })
  .catch((err) => {
    console.error('Erreur de connexion à MongoDB:', err);
  });

// Fonction pour générer une clé unique d'activation
function generateUniqueKey() {
  const key = crypto.randomBytes(8).toString('hex');
  console.log('Nouvelle clé générée:', key);
  return key;
}

// Fonction pour sauvegarder une nouvelle clé dans MongoDB
async function saveKey(email) {
  const key = generateUniqueKey();
  try {
    const activationKey = new ActivationKey({
      key,
      email,
      created_at: new Date(),
      status: 'unused',
      use_count: 0,
      max_uses: 2,
    });
    await activationKey.save();
    console.log('Clé sauvegardée avec succès:', key);
    return key;
  } catch (error) {
    console.error('Erreur lors de la sauvegarde de la clé:', error);
    throw error;
  }
}

// Fonction pour vérifier une clé d'activation
async function verifyKey(key, email) {
  try {
    const keyData = await ActivationKey.findOne({
      key,
      use_count: { $lt: 2 },
    });
    console.log('Résultat de la vérification:', keyData);
    return keyData;
  } catch (error) {
    console.error('Erreur lors de la vérification de la clé:', error);
    throw error;
  }
}

// Fonction pour marquer une clé comme utilisée
async function markKeyAsUsed(key, email) {
  try {
    const result = await ActivationKey.findOneAndUpdate(
      { key },
      {
        $inc: { use_count: 1 },
        used_at: new Date(),
        $set: {
          email: function (email, currentEmail) {
            return currentEmail ? `${currentEmail},${email}` : email;
          },
        },
      },
      { new: true }
    );
    console.log('Clé marquée comme utilisée:', result);
    return result;
  } catch (error) {
    console.error('Erreur lors du marquage de la clé:', error);
    throw error;
  }
}

// Configuration du transporteur email
const transporter = nodemailer.createTransport({
  host: 'smtp.hostinger.com',
  port: 465,
  secure: true,
  auth: {
    user: process.env.EMAIL_USER,
    pass: process.env.EMAIL_PASS,
  },
  tls: {
    rejectUnauthorized: true,
  },
});

// Fonction pour envoyer l'email d'activation
async function sendActivationEmail(customerEmail, activationKey) {
  const mailOptions = {
    from: {
      name: 'Immotep Support',
      address: process.env.EMAIL_USER,
    },
    to: customerEmail,
    subject: "Votre clé d'activation Premium",
    html: `
      <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto;">
        <h1>Merci pour votre achat !</h1>
        <p>Voici votre clé d'activation pour l'extension Premium :</p>
        <h2 style="background-color: #f0f0f0; padding: 10px; border-radius: 5px;">${activationKey}</h2>
        <p>Cette clé peut être utilisée jusqu'à 2 fois.</p>
        <p>Pour activer votre compte premium, veuillez :</p>
        <ol>
          <li>Ouvrir l'extension</li>
          <li>Cliquer sur "Activer Premium"</li>
          <li>Entrer votre email et la clé d'activation ci-dessus</li>
        </ol>
      </div>
    `,
  };

  try {
    await transporter.sendMail(mailOptions);
    console.log("Email d'activation envoyé avec succès");
    return true;
  } catch (error) {
    console.error("Erreur lors de l'envoi de l'email:", error);
    return false;
  }
}

// Route pour créer une session de paiement Stripe
app.post('/create-session', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Extension Premium',
              description: 'Accès à vie aux fonctionnalités premium',
            },
            unit_amount: 999,
          },
          quantity: 1,
        },
      ],
      mode: 'payment',
      success_url: `${
        process.env.BASE_URL || 'http://localhost:3000'
      }/success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${
        process.env.BASE_URL || 'http://localhost:3000'
      }/cancel?session_id={CHECKOUT_SESSION_ID}`,
    });

    res.json({ id: session.id });
  } catch (error) {
    console.error('Erreur création session:', error);
    res.status(500).json({ error: error.message });
  }
});

app.get('/stripe-mode', (req, res) => {
  const publicKey = STRIPE_MODE
    ? process.env.STRIPE_LIVE_PUBLIC_KEY
    : process.env.STRIPE_TEST_PUBLIC_KEY;
  res.json({ publicKey });
});

// Route pour gérer le succès du paiement
app.get('/success', async (req, res) => {
  try {
    const session = await stripe.checkout.sessions.retrieve(
      req.query.session_id
    );
    if (session.payment_status === 'paid') {
      const customerEmail = session.customer_details.email;

      const activationKey = await saveKey(customerEmail);
      console.log('Clé générée pour le succès:', activationKey);

      if (!activationKey) {
        throw new Error('Échec de la génération de la clé');
      }

      await sendActivationEmail(customerEmail, activationKey);

      res.send(`
        <html>
          <body>
            <h1>Paiement réussi!</h1>
            <p>Votre extension est maintenant en version premium.</p>
            <p>Un email contenant votre clé d'activation a été envoyé à ${customerEmail}</p>
            <script>
              window.opener.postMessage({ type: 'payment_success' }, '*');
            </script>
          </body>
        </html>
      `);
    }
  } catch (error) {
    console.error('Erreur traitement succès:', error);
    res
      .status(500)
      .send('Une erreur est survenue lors de la génération de votre clé');
  }
});

// Route pour gérer l'annulation du paiement
app.get('/cancel', (req, res) => {
  res.send('Paiement annulé. Vous pouvez fermer cette fenêtre.');
});

// Routes pour servir les fichiers HTML
app.get('/payment.html', (req, res) => {
  res.sendFile(__dirname + '/payment.html');
});

app.get('/activation.html', (req, res) => {
  res.sendFile(__dirname + '/activation.html');
});

// Route pour vérifier les clés d'activation
app.post('/verify-key', async (req, res) => {
  const { key, email } = req.body;

  try {
    const keyData = await verifyKey(key, email);
    if (keyData) {
      await markKeyAsUsed(key, email);
      res.json({ valid: true });
    } else {
      res.json({
        valid: false,
        message: "Clé invalide ou nombre maximum d'utilisations atteint",
      });
    }
  } catch (error) {
    console.error('Erreur vérification clé:', error);
    res.status(500).json({ error: error.message });
  }
});

// Route racine pour le health check de Render
// Cette route simple permet à Render de vérifier que le serveur répond correctement
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Server is running and healthy',
  });
});

// Webhook Stripe
app.post(
  '/webhook',
  express.raw({ type: 'application/json' }),
  async (request, response) => {
    const sig = request.headers['stripe-signature'];
    let event;

    try {
      event = stripe.webhooks.constructEvent(
        request.body,
        sig,
        STRIPE_MODE
          ? process.env.STRIPE_LIVE_WEBHOOK_SECRET
          : process.env.STRIPE_TEST_WEBHOOK_SECRET
      );
    } catch (err) {
      console.error('Erreur webhook:', err);
      response.status(400).send(`Webhook Error: ${err.message}`);
      return;
    }

    if (event.type === 'checkout.session.completed') {
      const session = event.data.object;
      response.json({
        success: true,
        userStatus: true,
      });
    }

    response.json({ received: true });
  }
);

// Démarrage du serveur avec configuration pour environnement local et production
const PORT = process.env.PORT || 3000;
app.listen(PORT, '0.0.0.0', () =>
  console.log(`Serveur démarré sur le port ${PORT}`)
);
