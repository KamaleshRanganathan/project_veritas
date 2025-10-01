const mongoose = require('mongoose');
require('dotenv').config();

const connectDB = async() => {
    try{
        const conn = await mongoose.connect(process.env.key);
        console.log(`mongoDb connected: ${conn.connection.host}`)
    }catch(e){
        console.error(e.message);
        process.exit(1);
    }
}

module.exports = connectDB;