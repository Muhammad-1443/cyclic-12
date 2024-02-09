require('dotenv').config();
const stripe = require('stripe')(process.env.STRIPE_SECRET_KEY);

const express = require('express');
const cors = require('cors');
const { MongoClient, ServerApiVersion, ObjectId } = require('mongodb');
const app = express();
const port = process.env.PORT || 5000;
const nodemailer = require('nodemailer')

// middleware
app.use(cors());
app.use(express.json());

const uri = `mongodb+srv://${process.env.DB_USER}:${process.env.DB_PASS}@cluster0.jv8sqpa.mongodb.net/?retryWrites=true&w=majority`;

// Create a MongoClient with a MongoClientOptions object to set the Stable API version
const client = new MongoClient(uri, {
  serverApi: {
    version: ServerApiVersion.v1,
    strict: true,
    deprecationErrors: true,
  }
});

async function run() {
  try {
    // Connect the client to the server	(optional starting in v4.7)
   // await client.connect();

   const userCollection = client.db('Fast').collection('users');
   const parcelCollection = client.db('Fast').collection('parcels');
   const paymentCollection = client.db('Fast').collection('payments');
   const reviewCollection = client.db('Fast').collection('reviews');

   // payment intent
   app.post('/create-payment-intent', async (req, res) => {
    const { price } = req.body;
    const amount = parseInt(price * 100);
    //console.log(amount, 'amount inside the intent')

    const paymentIntent = await stripe.paymentIntents.create({
      amount: amount,
      currency: 'usd',
      payment_method_types: ['card']
    });

    res.send({
      clientSecret: paymentIntent.client_secret
    })
  });

  app.post('/payments', async (req, res) => {
    const newPayment = req.body;
  //  console.log(newPayment);
    const result = await paymentCollection.insertOne(newPayment);
    res.send(result);

    // Send email

    //Create a transporter
    const transporter = nodemailer.createTransport({
      service: 'gmail',
      host: 'smtp.gmail.com',
      port: 587,
      secure: false,
      auth: {
        user: process.env.USER,
        pass: process.env.PASS,
      },
    })

    // const mailOptions = {
    //   from: process.env.USER,
    //   to: req.body.email,
    //   subject: 'Payment Confirmation',
    //   html: `<p>You have paid ${req.body.cost}. Your Transaction id is: ${req.body.transactionId}</p>.`,
    // }

    //verify connection
    transporter.verify((error, success) => {
      if (error) {
        console.log(error)
      } else {
        console.log('Server is ready to take our emails', success)
      }
    })

    const mailBody = {
      from: {
        name: 'FAST',
        address: process.env.USER,
      },
      to: req.body.email,
      subject: 'Payment Confirmation',
      html: `<p>Dear ${req.body.name} Sir/Madam,<br>You have paid ${req.body.price}. Your Transaction id is: ${req.body.transactionId}. Thanks for having with us.</p>.`,
    }

    await new Promise((resolve, reject) => {
      transporter.sendMail(mailBody, (err, info) => {
        if (err) {
          console.error(err);
          reject(err);
        } else {
          resolve(info);
        }
      });
    });

    // transporter.sendMail(mailBody, (error, info) => {
    //   if (error) {
    //     console.log(error)
    //   } else {
    //     console.log('Email sent: ' + info.response)
    //   }
    // })
  })

   // review related api
   app.post('/reviews', async (req, res) => {
    const newReview = req.body;
   // console.log(newReview);
    const result = await reviewCollection.insertOne(newReview);
    res.send(result);
  })

    app.get('/reviews', async (req, res) => {

      let queryObj = {};

      const delivery_men_id = req.query.delivery_men_id;

      //console.log(delivery_men_id);

      if(delivery_men_id) {
          queryObj.delivery_men_id = delivery_men_id;
      }
    
      //console.log(queryObj);

      const cursor = reviewCollection.find(queryObj);
      const result = await cursor.toArray();
      //console.log(result);
      res.send(result);
    
    })

   // user related api
   app.post('/users', async (req, res) => {
    const user = req.body;
   // console.log(user);
    
    const query = {email: user.email};
    const existingUser = await userCollection.findOne(query);
    if(existingUser){
      return res.send({message: 'User Already Exists!', insertedId: null});
    }
    
    const result = await userCollection.insertOne(user);
    res.send(result);
  })

  // Get user role
  app.get('/users/:email', async (req, res) => {
    const email = req.params.email
    const result = await userCollection.findOne({ email })
    res.send(result)
  })

  app.get('/userCount', async (req, res) => {
    let queryObj = {};

    const role = req.query.role;

    if(role){
      queryObj.role = role;
    }

  //  console.log(queryObj);

    const cursor = userCollection.find(queryObj);
    const result = (await cursor.toArray());
    //console.log('User: ', result);
    res.send(result);
  })

  app.get('/parcelCount', async (req, res) => {
    let queryObj = {};

    const status = req.query.status;

    if(status){
      queryObj.status = status;
    }

   // console.log(queryObj);

    const cursor = parcelCollection.find(queryObj);
    const result = (await cursor.toArray());
    //console.log('User: ', result);
    res.send(result);
  })

  app.get('/bookingdate', async (req, res) => {

    const result = await parcelCollection.aggregate([
      {
        $match: {
          booking_date: { $exists: true, $type: 'string' } // Filter documents with "booking_date" as string
        }
      },
      {
        $group: {
          _id: { $dateToString: { format: '%Y-%m-%d', date: { $toDate: '$booking_date' } } },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { _id: 1 }
      }
    ]).toArray();

  //  console.log(result);

    res.send(result);
  })

  app.get('/users', async (req, res) => {

    let queryObj = {};
    let sortObj = {};

    const role = req.query.role;
    const email = req.query.email;

    if(role){
      queryObj.role = role;
    }

    if(email){
      queryObj.email = email;
    }

    const sortField = req.query.sortField;
    const sortOrder = req.query.sortOrder;

    const sortf = req.query.sortf;
    const sorto = req.query.sorto;

    if(sortField && sortOrder && sortf && sorto ){
      sortObj[sortField] = sortOrder;
      sortObj[sortf] = sorto;
    }

   // console.log(sortObj);

    const page = parseInt(req.query.page);
    const size = parseInt(req.query.size);

   // console.log('pagination query', page, size);

    if(size){
      const result = await userCollection.find(queryObj)
      .skip(page * size)
      .limit(size)
      .toArray();
      res.send(result);
    }
    else{
      const cursor = userCollection.find(queryObj).sort(sortObj);
      const result = await cursor.toArray();
      res.send(result);
    }
  })

  app.put("/users/:email", async (req, res) => {
    const email = req.params.email;
    const data = req.body;

    const filter = {
      email: email,
      };
    const options = { upsert: true };
    const updatedData = {
      $set: {
        number: data.number,
        numberofParcelBooked: data.numberofParcelBooked,
        totalSpent: data.totalSpent,
        image: data.image,
        role: data.role,
        numberOfParcelDelivered: data.numberOfParcelDelivered,
        totalReview: data.totalReview,
        numberOfRating: data.numberOfRating,
        averageRating: data.averageRating
        },
      };
    const result = await userCollection.updateOne(
      filter,
      updatedData,
      options
      );
    res.send(result);
    });

  // parcel related api
  app.post('/parcels', async (req, res) => {
    const newReview = req.body;
    newReview.requestedDeliveryDate = new Date(req.body.requestedDeliveryDate);
   // console.log(newReview);
  //  console.log(req.body.requestedDeliveryDate)
    const result = await parcelCollection.insertOne(newReview);
    res.send(result);
  })

  app.get('/parcels', async (req, res) => {

    let queryObj = {};

    const email = req.query.email;
    const status = req.query.status;
    const delivery_men_email = req.query.delivery_men_email;
    const delivery_men_id = req.query.delivery_men_id;

 //   console.log(delivery_men_id);

    if(email){
      queryObj.email = email;
    }

    if(status){
      queryObj.status = status;
    }

    if(delivery_men_email){
      queryObj.delivery_men_email = delivery_men_email;
    }

    if(delivery_men_id) {
        queryObj.delivery_men_id = delivery_men_id;
    }

    const startDate = req.query.startDate;
    const endDate = req.query.endDate;

    //console.log(startDate, endDate);

    if(startDate && endDate){

      const start = new Date(startDate);
      const end = new Date(endDate);

      console.log(start, end);
      // console.log(startDate, endDate);
      queryObj = {requestedDeliveryDate: {
        $gte: start,
        $lte: end
      }}
    }
    
   // console.log(queryObj);

    const cursor = parcelCollection.find(queryObj);
    const result = await cursor.toArray();
   // console.log(result);
    res.send(result); 
  })

  app.get("/parcels/:id", async (req, res) => {
    const id = req.params.id;
  //  console.log("id", id);
    const query = {
      _id: new ObjectId(id),
    };
    const result = await parcelCollection.findOne(query);
  //  console.log(result);
    res.send(result);
  });

  app.put("/parcels/:id", async (req, res) => {
    const id = req.params.id;
    const data = req.body;

    const filter = {
      _id: new ObjectId(id),
    };
    const options = { upsert: true };
    const updatedData = {
      $set: {
        number: data.number, 
        parcel_type: data.parcel_type, 
        receiver_name: data.receiver_name, 
        receiver_number: data.receiver_number, 
        parcel_weight: data.parcel_weight, 
        cost: data.cost, 
        delivery_address: data.delivery_address, 
        requestedDeliveryDate: new Date(data.requestedDeliveryDate),
        latitude: data.latitude, 
        longitude: data.longitude,
        status: data.status,
        approximate_delivery_date: data.approximate_delivery_date,
        delivery_men_id: data.delivery_men_id,
        delivery_men_email: data.delivery_men_email,
        payment_status: data.payment_status
      },
    };
    const result = await parcelCollection.updateOne(
      filter,
      updatedData,
      options
    );
    res.send(result);
  });

    // Send a ping to confirm a successful connection
    await client.db("admin").command({ ping: 1 });
    console.log("Pinged your deployment. You successfully connected to MongoDB!");
  } finally {
    // Ensures that the client will close when you finish/error
    // await client.close();
  }
}
run().catch(console.dir);

app.get('/', (req, res) => {
    res.send('Fast server is running')
})

app.listen(port, () => {
    console.log(`Fast Server is running on port: ${port}`)
})