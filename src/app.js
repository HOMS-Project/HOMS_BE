require("dotenv").config();
const express = require("express");
const connectDB = require("./config/database");
const errorMiddleware = require("./middlewares/errorMiddleware"); 
const cors = require('cors');
const app = express();
const cookieParser = require('cookie-parser');
connectDB();
app.use(cors({
    origin: 'http://localhost:3000',
    credentials: true
}));
app.use(express.json());
app.use(cookieParser());
app.get("/", (req, res) => {
  res.send("HOMS Backend is running 🚚");
});

const authRoutes = require("./routes/authRoutes");
const userRoutes = require("./routes/userRoutes");
const requestTicketRoutes = require("./routes/requestTicketRoutes");
const invoiceRoutes = require("./routes/invoiceRoutes");
const surveyRoutes = require("./routes/surveyRoutes");
const priceListRoutes = require("./routes/priceListRoutes");
const pricingRoutes = require("./routes/pricingRoutes");

app.use("/api/auth", authRoutes);
app.use("/api/customer", userRoutes);
app.use("/api/request-tickets", requestTicketRoutes);
app.use("/api/invoices", invoiceRoutes);
app.use("/api/surveys", surveyRoutes);
app.use("/api/price-lists", priceListRoutes);
app.use("/api/pricing", pricingRoutes);

app.use(errorMiddleware);
const PORT = process.env.PORT || 5000;
app.listen(PORT, () => {
  console.log(`🚀 Server running on port ${PORT}`);
});

module.exports = app;

