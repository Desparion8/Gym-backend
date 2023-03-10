import User from '../models/User.js';
import Records from '../models/Records.js';
import bcrypt from 'bcrypt';
import validator from 'validator';
import asyncHandler from 'express-async-handler';
import jwt from 'jsonwebtoken';
// import {
// 	transporter,
// 	passwordResetRequestMailTemplate,
// 	passwordChangeConfirmationMailTemplate,
// } from '../mailService.js';

import nodemailer from 'nodemailer';

const emailRegex = /^[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}$/;
const passwordRegex =
	/^(?=.*[A-Za-z])(?=.*\d)(?=.*[@$!%*#?&])[A-Za-z\d@$!%*#?&]{8,}$/;
const saltRounds = 10;

//@desc Create new user
//@route POST /users
//@access Public
export const createNewUser = asyncHandler(async (req, res, next) => {
	// Check for all required data
	if (!req.body.username || !req.body.email || !req.body.password) {
		return res.status(400).json({
			error:
				'Nazwa uzytkownika, email i hasło są wymagane do utworzenia nowego użytkownia.',
		});
	}
	// Validate email
	if (!validator.isEmail(req.body.email)) {
		return res.status(400).json({
			error: 'Emial nie jest poprawny.',
		});
	}
	// Validate password

	if (!passwordRegex.test(req.body.password)) {
		return res.status(400).json({
			error:
				'Hasło musi składać się z 8 znaków i zawierać cyfre oraz znak specjalny.',
		});
	}

	// Check if the email or username already exists in the database
	const existingUserEmail = await User.findOne({ email: req.body.email });
	if (existingUserEmail) {
		return res.status(400).json({
			error: 'Użytkownik o podanym emailu już istnieje.',
		});
	}

	const existingUserName = await User.findOne({
		username: new RegExp(`^${req.body.username}$`, 'i'),
	});
	if (existingUserName) {
		return res.status(400).json({
			error: 'Uzytkownik o podanej nazwie już istnieje.',
		});
	}
	// Hash password
	const hashedPassword = await bcrypt.hash(req.body.password, saltRounds);

	const newUser = {
		username: req.body.username,
		email: req.body.email,
		password: hashedPassword,
	};
	// Save the new user to the database
	const user = await User.create(newUser);
	// Create default records for new user
	const records = await Records.create({ user });

	if (user) {
		res.status(201).json({
			message: `Nowy użytkownik ${req.body.username} został utworzony.`,
		});
	} else {
		res.status(400).json({ message: 'Nieprawidłowe dane.' });
	}
});

//@desc Update user
//@route PATCH /users
//@access Private
export const updateUser = asyncHandler(async (req, res, next) => {
	const { newPassword, newEmail, password } = req.body;
	const user = await User.findOne(req.user);
	if (password !== '') {
		// Compare old password
		const match = bcrypt.compare(password, user.password);
		if (!match) {
			return res.status(400).json({
				message: 'Brak autoryzacji, niepoprawne hasło.',
			});
		}
	}

	// Check for neede data
	if (!newPassword && !newEmail) {
		return res.status(400).json({
			message: 'Brak danych do zaaktualizowania.',
		});
	}
	// Update Password
	if (newPassword) {
		if (!passwordRegex.test(newPassword)) {
			return res.status(400).json({
				message:
					'Hasło musi składać się z 8 znaków i zawierać jedną cyfre oraz znak specjalny.',
			});
		}
		// hash password
		const hashedPassword = await bcrypt.hash(newPassword, saltRounds);
		user.password = hashedPassword;
		await user.save();

		return res.status(200).json({ message: 'Hasło zostało zmienione.' });
	}
	// updateEmail
	if (newEmail) {
		// Check if the email already exists in the database
		const existingUserEmail = await User.findOne({ email: newEmail });
		if (existingUserEmail) {
			return res.status(400).json({
				message: 'Użytkownik o podanym emailu już istnieje.',
			});
		}
		// Check email
		if (!emailRegex.test(newEmail)) {
			return res.status(400).json({
				message: 'Email jest nieprawidłowy',
			});
		}
		// update email
		user.email = newEmail;
		await user.save();
		return res.status(200).json({ message: 'Email został zmieniony.' });
	}
});

//@desc Reset password and send email with link for create new password
//@route POST /users/resetpassword
//@access Public
export const resetPassword = asyncHandler(async (req, res) => {
	const { email } = req.body;

	const existingUser = await User.findOne({ email });
	if (!existingUser)
		return res.status(404).json({
			message: 'Użytkownik o podanym e-mailu nie został odnaleziony.',
		});
	// generate reset token
	const token = jwt.sign(
		{ id: existingUser._id.toString() },
		process.env.ACCESS_TOKEN_SECRET,
		{
			expiresIn: '15min',
		}
	);
	// link for testing
	// const link = `http://localhost:5173/resetpassword/#access_token=${token}`;
	const link = `https://gym-app-pi-three.vercel.app/resetpassword/#access_token=${token}`;

	// send email with reset link
	const transporter = nodemailer.createTransport({
		service: 'gmail',
		secure: false,
		auth: {
			user: process.env.EMAIL,
			pass: process.env.EMAIL_PASSWORD,
		},
		tls: {
			rejectUnauthorized: false,
		},
	});
	const mailOptions = {
		from: process.env.EMAIL,
		to: email,
		subject: 'Reset hasła w aplikacji Menadżer Treningu',
		text:
			'Witaj! Otrzymałeś ten e-mail, ponieważ złożyłeś prośbę o zresetowanie hasła. Kliknij na poniższy link, aby przejść do strony resetowania hasła. Ważność linku wygaśnie po 15 minutach. ' +
			link,
	};
	transporter.sendMail(mailOptions, (error, info) => {
		if (error) {
			res.status(500).json({
				message:
					'Wystąpił problem podczas wysyłania emaila resetującego hasło.',
			});
		} else {
			res.status(200).json({
				message: `Email resetujący hasło został wysłany na adres ${email}.`,
			});
		}
	});
});

//@desc Create new password for user who forgot old password
//@route PATCH /users/resetpassword
//@access Public
export const newPassword = asyncHandler(async (req, res) => {
	const { token, password } = req.body;

	let userID;

	jwt.verify(token, process.env.ACCESS_TOKEN_SECRET, (err, decoded) => {
		if (err) {
			// when something go wrong on decoding
			return res
				.status(419)
				.json({ message: 'Token jest niepoprawny lub starcił ważność' });
		} else {
			userID = decoded.id;
		}
	});
	// when decoding is successful
	const user = await User.findOne({ _id: userID });

	if (!user) {
		return res.status(400).json({
			error: 'Uzytkownik o podanej nazwie już istnieje.',
		});
	}
	if (!passwordRegex.test(password)) {
		return res.status(400).json({
			message:
				'Hasło musi składać się z 8 znaków i zawierać jedną cyfre oraz znak specjalny.',
		});
	}
	const hashedPassword = await bcrypt.hash(password, saltRounds);
	user.password = hashedPassword;
	await user.save();

	return res.status(200).json({ message: 'Hasło zostało zmienione.' });
});
