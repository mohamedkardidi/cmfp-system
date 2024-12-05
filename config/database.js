const mongoose = require('mongoose');

const connectDB = async () => {
    try {
        const conn = await mongoose.connect('mongodb://localhost:27017/cmfp_db', {
            serverSelectionTimeoutMS: 5000, // Optional: Adjust timeout settings if needed
            family: 4 // IPv4 only
        });

        console.log('MongoDB Connected Successfully!');
        console.log(`Host: ${conn.connection.host}`);
        console.log(`Database: ${conn.connection.name}`);
        
        // List all collections
        const collections = await conn.connection.db.listCollections().toArray();
        console.log('Available collections:', collections.map(c => c.name));
        
        // Create users collection if it doesn't exist
        if (!collections.find(c => c.name === 'users')) {
            await conn.connection.db.createCollection('users');
            console.log('Users collection created');
        }

        // Create indexes for better performance
        await conn.connection.collection('users').createIndex({ username: 1 }, { unique: true });
        console.log('Database indexes created successfully');

        // Count users in collection
        const userCount = await conn.connection.collection('users').countDocuments();
        console.log('Number of users in database:', userCount);

        return conn;
    } catch (error) {
        console.error('MongoDB Connection Error:', error);
        process.exit(1);
    }
};

module.exports = connectDB;

