import dotenv from 'dotenv';
dotenv.config();
import express from 'express';
import path from 'path';
import { logger, logEvents } from './middleware/logger.js';
import errorHandler from './middleware/errorHandler.js';
import cookieParser from 'cookie-parser';
import cors from 'cors';
import corsOptions from './config/corsOptions.js';
import connectDB from './config/db.js';
import mongoose from 'mongoose';

import mainRouter from './routes/root.js';
import authRoutes from './routes/authRoutes.js';
import usersRoutes from './routes/usersRoutes.js';
import trainingRoutes from './routes/trainingRoutes.js';
import trainingSetRoutes from './routes/trainingSetRoutes.js';
import exercisesRoutes from './routes/exercisesRoutes.js';
import exampleTrainingRoutes from './routes/exampleTrainingRoutes.js';

const app = express();
const PORT = process.env.PORT || 3000;
const __dirname = path.resolve();

console.log(process.env.NODE_ENV);

mongoose.set('strictQuery', false);
connectDB();

app.use(logger);

app.use(cors(corsOptions));

app.use(express.json());

app.use(cookieParser());

app.use('/', express.static(path.join(__dirname, 'public')));
app.use('/', mainRouter);
app.use('/auth', authRoutes);
app.use('/users', usersRoutes);
app.use('/training', trainingRoutes);
app.use('/set', trainingSetRoutes);
app.use('/exercise', exercisesRoutes);
app.use('/exampletraining', exampleTrainingRoutes);

app.all('*', (req, res) => {
	res.status(404);

	if (req.accepts('html')) {
		res.sendFile(path.join(__dirname, 'views', '404.html'));
	} else if (req.accepts('json')) {
		res.json({ message: '404 Not Found' });
	} else {
		res.type('txt').send('404 Not Found');
	}
});
app.use(errorHandler);

app.listen(PORT, () => console.log(`Server running on port ${PORT} `));

mongoose.connection.on('error', (err) => {
	console.log(err);
	logEvents(
		`${err.no}: ${err.code}\t${err.syscall}\t${err.hostname}`,
		'mongoErrLog.log'
	);
});
