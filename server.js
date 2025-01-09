// Mode Stripe (true = production, false = test)
const STRIPE_MODE = true;

// Configuration des modules requis
require('dotenv').config();
const express = require('express');
const path = require('path');
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

// Configuration pour servir les fichiers statiques
app.use(express.static(__dirname));
app.use('/fonts', express.static(path.join(__dirname, 'fonts')));

// Routes pour servir les fichiers HTML
app.get('/payment.html', (req, res) => {
  res.sendFile(__dirname + '/payment.html');
});

app.get('/activation.html', (req, res) => {
  res.sendFile(__dirname + '/activation.html');
});

app.get('/success.html', (req, res) => {
  res.sendFile(path.join(__dirname, '/success.html'));
});

// Middleware de débogage pour les polices
app.use('/fonts', (req, res, next) => {
  console.log('Requête de police:', req.path);
  next();
});

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
async function sendActivationEmail(customerEmail, activationKey, amount) {
  const formattedAmount = (amount / 100).toFixed(2); // Convertir les centimes en euros
  const mailOptions = {
    from: {
      name: 'Immotep Support',
      address: process.env.EMAIL_USER,
    },
    to: customerEmail,
    subject: "Votre clé d'activation Premium",
    html: `
      <div style="max-width: 600px; margin: 0 auto; padding: 32px; background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);">
        <div style="background: white; padding: 32px; border-radius: 10px; box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;">
          <!-- En-tête -->
          <div style="text-align: center; margin-bottom: 32px;">
            <h1 style="color: #2d3748; font-size: 28px; margin-bottom: 16px; font-family: Arial, sans-serif;">Merci pour votre contribution de ${formattedAmount}€</h1>
            <p style="color: #4a5568; font-size: 16px; line-height: 1.6;">Voici votre accès premium à Immotep.</p>
          </div>

          <!-- Section Clé d'activation -->
          <div style="background-color: #f7fafc; padding: 24px; border-radius: 12px; margin-bottom: 32px; text-align: center;">
            <p style="color: #718096; margin-bottom: 12px; font-size: 14px;">VOTRE CLÉ D'ACTIVATION</p>
            <div style="background: #77be79; color: white; padding: 16px; border-radius: 8px; font-size: 20px; letter-spacing: 2px; font-family: monospace;">
              ${activationKey}
            </div>
            <p style="color: #718096; margin-top: 12px; font-size: 13px;">Cette clé peut être utilisée jusqu'à 2 fois</p>
          </div>

          <!-- Instructions -->
          <div style="margin-bottom: 32px;">
            <h2 style="color: #2d3748; font-size: 18px; margin-bottom: 16px;">Comment activer votre compte ?</h2>
            <div style="background: #f7fafc; padding: 20px; border-radius: 8px;">
              <ol style="color: #4a5568; margin: 0; padding-left: 20px;">
                <li style="margin-bottom: 12px;">Ouvrez l'extension Immotep</li>
                <li style="margin-bottom: 12px;">Cliquez sur "Activer Premium"</li>
                <li style="margin-bottom: 12px;">Entrez votre email et la clé d'activation ci-dessus</li>
              </ol>
            </div>
          </div>

          <!-- Footer -->
          <div style="text-align: center; padding-top: 24px; border-top: 1px solid #e2e8f0;">
            <p style="color: #718096; font-size: 14px;">Des questions ? Contactez-nous à ${process.env.EMAIL_USER}</p>
          </div>
        </div>
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
    // Récupérer le montant depuis la requête ou utiliser le montant par défaut
    const amount = req.body.amount || 999;

    // Vérifier que le montant est au moins de 10€
    if (amount < 1000) {
      // 1000 centimes = 10€
      throw new Error('Le montant minimum est de 10€');
    }

    const session = await stripe.checkout.sessions.create({
      payment_method_types: ['card'],
      line_items: [
        {
          price_data: {
            currency: 'eur',
            product_data: {
              name: 'Immotep - Support Premium',
              description:
                "Accès premium + Soutien au développement de l'extension",
            },
            unit_amount: amount,
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
    res.status(400).json({ error: error.message });
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
      const amount = session.amount_total; // Montant en centimes

      const activationKey = await saveKey(customerEmail);
      console.log('Clé générée pour le succès:', activationKey);

      if (!activationKey) {
        throw new Error('Échec de la génération de la clé');
      }

      await sendActivationEmail(customerEmail, activationKey, amount);

      // Lecture du template HTML
      let successTemplate = require('fs').readFileSync(
        path.join(__dirname, 'success.html'),
        'utf8'
      );

      // Remplacement de la variable dans le template
      successTemplate = successTemplate.replace(
        '${customerEmail}',
        customerEmail
      );

      res.send(successTemplate);
    }
  } catch (error) {
    console.error('Erreur traitement succès:', error);
    res.status(500).send(`
      <html>
        <head>
          <title>Erreur - Immotep Premium</title>
          <style>
            @font-face {
              font-family: 'Gilroy_Bold';
              src: url('/fonts/Gilroy-Bold.ttf') format('truetype');
            }
            @font-face {
              font-family: 'Gilroy_Medium';
              src: url('/fonts/Gilroy-Medium.ttf') format('truetype');
            }
            * {
              box-sizing: border-box;
              margin: 0;
              padding: 0;
            }
            body {
              display: flex;
              justify-content: center;
              min-height: 100vh;
              background: linear-gradient(135deg, #f5f7fa 0%, #c3cfe2 100%);
              padding: 20px;
              font-family: 'Gilroy_Medium', sans-serif;
            }
            .app_container {
              display: flex;
              justify-content: center;
              width: 100%;
              max-width: 500px;
              margin-top: 24px;
            }
            #AppCentered {
              display: flex;
              justify-content: center;
              flex-direction: column;
              align-items: center;
              padding: 32px;
              width: 100%;
              background: white;
              box-shadow: rgba(100, 100, 111, 0.2) 0px 7px 29px 0px;
              border-radius: 10px;
            }
            h1 {
              font-family: 'Gilroy_Bold';
              font-size: 24px;
              color: #e53e3e;
              margin-bottom: 24px;
              text-align: center;
            }
            .message {
              font-family: 'Gilroy_Medium';
              font-size: 16px;
              color: #4a5568;
              text-align: center;
              line-height: 1.6;
            }
          </style>
        </head>
        <body>
          <div class="app_container">
            <div id="AppCentered">
              <h1>Une erreur est survenue</h1>
              <p class="message">
                Nous n'avons pas pu générer votre clé d'activation.<br>
                Veuillez nous contacter pour résoudre ce problème.
              </p>
            </div>
          </div>
        </body>
      </html>
    `);
  }
});

// Route pour gérer l'annulation du paiement
app.get('/cancel', (req, res) => {
  res.send('Paiement annulé. Vous pouvez fermer cette fenêtre.');
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

// Route racine pour le health check
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
