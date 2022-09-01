const express = require("express");
const cors = require("cors");
const mongoose = require("mongoose");
const userRoute = require("./routes/user")

require("dotenv").config();

const app = express();
const port = process.env.port || 5000;


app.use(cors());
app.use(express.json());

const uri = process.env.ATLAS_URI;
mongoose.connect(uri, { useNewUrlParser: true });
const connection = mongoose.connection;
connection.once("open", () => {
  console.log("MongoDB database connected successfully");
});

app.use('/user', userRoute)

app.listen(port, () => {
  console.log(`server is running on port: ${port}`);
});


