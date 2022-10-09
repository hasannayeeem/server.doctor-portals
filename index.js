const express = require('express');
const cors = require('cors');
require('dotenv').config();
const nodemailer = require('nodemailer');
const mg = require('nodemailer-mailgun-transport');
const jwt = require('jsonwebtoken');
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5050


// middleware
app.use(cors());
app.use(express.json());


const verifyJWT = (req, res, next) => {
    const authHeader = req.headers.authorization;
    if (!authHeader) {
        return res.status(401).send({ message: 'UnAuthorized access' });
    }
    const token = authHeader.split(' ')[1];
    jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, function (err, decoded) {
        if (err) {
            return res.status(403).send({ message: 'Forbidden access' });
        }
        // console.log(decoded);
        req.decoded = decoded;
        next();
    })
}

const auth = {
    auth: {
      api_key: '93525b8b77b47a8b997bb819934ebac5-8d821f0c-f1899fd6',
      domain: 'sandbox6dd7008de42446d0a83c1ae8a25844f7.mailgun.org'
    }
  }
  const nodemailerMailgun = nodemailer.createTransport(mg(auth));



const uri = `mongodb+srv://doctors_portal:Password6246Naim@cluster0.xtai9.mongodb.net/?retryWrites=true&w=majority`;
const client = new MongoClient(uri, { useNewUrlParser: true, useUnifiedTopology: true, serverApi: ServerApiVersion.v1 });

async function run() {
    try {
        await client.connect();
        const servicesCollection = client.db('doctors_portal').collection('services');
        const bookingCollection = client.db('doctors_portal').collection('bookings');
        const userCollection = client.db('doctors_portal').collection('users');
        const doctorCollection = client.db('doctors_portal').collection('doctors');
        const paymentCollection = client.db('doctors_portal').collection('payments');
        const hasaimCollection = client.db('doctors_portal').collection('hasaim');
        const sadikurCollection = client.db('doctors_portal').collection('sadikur');


        const verifyAdmin = async (req, res, next) =>{
            const requester = req.decoded.email;
            const requesterAccount = await userCollection.findOne({ email: requester });
            if (requesterAccount.role === 'admin') {
                next();
            }
            else{
                res.status(403).send({message: 'forbidden'});
            }
        }

        app.post('/create-payment-intent', verifyJWT, async (req, res) =>{
            const service = req.body;
            const price = service.price;
            const amount = price * 100;
            const paymentIntent = await stripe.paymentIntents.create({
                amount: amount,
                currency: 'USD',
                payment_method_types:['card']
            });
            res.send({clientSecret: paymentIntent.client_secret})
        });

        app.get('/service', async (req, res) => {
            const query = {};
            const cursor = servicesCollection.find(query).project({name:1});
            services = await cursor.toArray();
            res.send(services)
        });

        // all hasaims api
        app.get('/hasaims', async (req, res) => {
            const query = {};
            const cursor = hasaimCollection.find(query);
            const hasaims = await cursor.toArray();
            res.send(hasaims);
        });
        // sadikur api 
        app.get('/sadikurs', async (req, res) => {
            const query = {};
            const cursor = sadikurCollection.find(query);
            const sadikurs = await cursor.toArray();
            res.send(sadikurs);
        });

        app.get('/user', verifyJWT, async (req, res) => {
            const users = await userCollection.find().toArray();
            res.send(users);
        });

        app.put('/user/:email', async (req, res) => {
            const email = req.params.email;
            const user = req.body;
            const filter = { email: email };
            const options = { upsert: true };
            const updateDoc = {
                $set: user,
            };
            const result = await userCollection.updateOne(filter, updateDoc, options);
            const token = jwt.sign({ email: email }, process.env.ACCESS_TOKEN_SECRET, { expiresIn: '1d' })

            res.send({ result, token });
        });


        app.get('/admin/:email', async (req, res) =>{
            const email = req.params.email;
            const user = await userCollection.findOne({email: email});
            const isAdmin = user.role === 'admin';
            res.send({admin: isAdmin})
        });

        app.put('/user/admin/:email', verifyJWT, verifyAdmin, async (req, res) => {
            const email = req.params.email;
            // const requester = req.decoded.email;
            // const requesterAccount = await userCollection.findOne({ email: requester });
            // if (requesterAccount.role === 'admin') {
                const filter = { email: email };
                const updateDoc = {
                    $set: { role: 'admin' },
                };
                const result = await userCollection.updateOne(filter, updateDoc);

                res.send({ result });
            // }
            // else{
            //     res.status(403).send({message: 'forbidden'});
            // }

        });

        // warning:
        // this is not the proper way to query.
        // after learning more about mongodb. use aggregate lookup, pipeline, match, group
        app.get('/available', async (req, res) => {
            const date = req.query.date || 'May 23, 2022';

            // step 1: get all services

            const services = await servicesCollection.find().toArray();


            // step 2: get the booking of the day output: [{},{},{},{},{},{}]
            const query = { date: date };
            const bookings = await bookingCollection.find(query).toArray();

            // step 3: for each service, find bookings for that service
            services.forEach(service => {
                // step 4: find booking for that service output: [{},{},{}]
                const serviceBookings = bookings.filter(book => book.treatment === service.name);
                //step 5: select slot for the service booking: ['', '', '', '']
                const booked = serviceBookings.map(book => book.slot);
                //step 6: select those slots that are not in bookings
                const available = service.slots.filter(slot => !booked.includes(slot));
                // step 7: set available to slotsto make is easier
                service.available = available;
                // const serviceBookings = bookings.filter(b => b.treatment === service.name);
                // const booked = serviceBookings.map(s=> s.slot);
                // const available = service.slots.filter(s=> !booked.includes(s));
                // service.available = available;



                // service.booked = booked
                // service.booked = serviceBookings.map(s=> s.slot);

            });
            res.send(services);
        })
        /**
         * API Naming convention
         * app.get('/booking')  get all booking in this collection. or get more than one or bly filter
         * app.get('/booking/:id')  get a specific booking
         * app.post('/booking') add a new booking
         * app.patch('/booking/:id') 
         * app.put('/booking/:id) // upsert ==> update (if exists) or insert (if doesn't exists)
         * app.delete('/booking/:id') 
         */

        app.get('/booking', verifyJWT, async (req, res) => {
            const patient = req.query.patient;
            // const authorization = req.headers.authorization;
            // console.log('auth header', authHeader);
            const decodedEmail = req.decoded.email;
            if (patient === decodedEmail) {
                const query = { patient: patient };
                const bookings = await bookingCollection.find(query).toArray();
                return res.send(bookings);
            }
            else {
                return res.status(403).send({ message: 'Forbidden access' });
            }

        });

        app.get('/booking/:id', verifyJWT, async (req, res) =>{
            const id = req.params.id;
            const query = {_id: ObjectId(id)};
            const booking = await bookingCollection.findOne(query);
            res.send(booking);
        })

        app.post('/booking', async (req, res) => {
            const booking = req.body;
            const query = { treatment: booking.treatment, date: booking.date, patient: booking.patient }
            const exists = await bookingCollection.findOne(query);
            if (exists) {
                return res.send({ success: false, booking: exists })
            }
            const result = await bookingCollection.insertOne(booking);
            return res.send({ success: true, result });
        });

        app.patch('/booking/:id', verifyJWT, async (req, res) =>{
            const id = req.params.id;
            const payment = req.body;
            const filter = {_id: ObjectId(id)};
            const updateDoc = {
                $set: {
                    paid: true,
                    transactionId: payment.transactionId,
                }
            }
            const result = await paymentCollection.insertOne(payment);
            const updatedBooking = await bookingCollection.updateOne(filter, updateDoc);
            res.send(updateDoc);
        });

        app.get('/doctor', verifyJWT, verifyAdmin, async (req, res) =>{
            const doctors = await doctorCollection.find().toArray();
            res.send(doctors);
        });

        app.post('/doctor', verifyJWT, verifyAdmin, async (req, res) =>{
            const doctor = req.body;
            const result = await doctorCollection.insertOne(doctor);
            res.send(result);
        });

        app.delete('/doctor/:email', verifyJWT, verifyAdmin, async (req, res) =>{
            const email = req.params.email;
            const filter = {email};
            const result = await doctorCollection.deleteOne(filter);
            res.send(result);
        });

        const email = {
            from: 'myemail@example.com',
            to: 'qawmiinstitute@gmail.com', // An array if you have multiple recipients.
            subject: 'Hey you, awesome!',
            text: 'Mailgun rocks, pow pow!'
          };

        app.get('/email', async (req, res) => {
            nodemailerMailgun.sendMail(email, (err, info) => {
                if (err) {
                  console.log(`Error: ${err}`);
                }
                else {
                  console.log(`Response: ${info}`);
                }
              });
            res.send({status: true});
        })
    }
    finally {

    }
}
run().catch(console.dir);




app.get('/', (req, res) => {
    res.send('hello from doctor uncle!')
})
app.listen(port, () => {
    console.log(`doctors app listening on port ${port}`);
})