// Import Redis client for token storage
import { redis } from "../lib/redis.js";

// Import User model for DB operations
import User from "../models/user.model.js";

// Import JWT for token generation and verification
import jwt from "jsonwebtoken";

// ===================== Function: generateTokens =====================
// Generates access and refresh tokens using JWT
const generateTokens = (userId) => {
	const accessToken = jwt.sign({ userId }, process.env.ACCESS_TOKEN_SECRET, {
		expiresIn: "15m", // Access token expires in 15 minutes
	});

	const refreshToken = jwt.sign({ userId }, process.env.REFRESH_TOKEN_SECRET, {
		expiresIn: "7d", // Refresh token expires in 7 days
	});

	return { accessToken, refreshToken };
};

// ===================== Function: storeRefreshToken =====================
// Stores the refresh token in Redis with a 7-day expiration
const storeRefreshToken = async (userId, refreshToken) => {
	await redis.set(`refresh_token:${userId}`, refreshToken, "EX", 7 * 24 * 60 * 60); // 7 days in seconds
};

// ===================== Function: setCookies =====================
// Sets access and refresh tokens in HTTP-only cookies
const setCookies = (res, accessToken, refreshToken) => {
	res.cookie("accessToken", accessToken, {
		httpOnly: true, // Helps prevent XSS attacks
		secure: process.env.NODE_ENV === "production", // Use secure cookies in production
		sameSite: "strict", // Helps prevent CSRF attacks
		maxAge: 15 * 60 * 1000, // 15 minutes in milliseconds
	});

	res.cookie("refreshToken", refreshToken, {
		httpOnly: true, // Helps prevent XSS attacks
		secure: process.env.NODE_ENV === "production",
		sameSite: "strict", // Helps prevent CSRF attacks
		maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days in milliseconds
	});
};

// ===================== Controller: signup =====================
// Handles user registration
export const signup = async (req, res) => {
	const { email, password, name } = req.body;

	try {
		// Check if user already exists
		const userExists = await User.findOne({ email });
		if (userExists) {
			return res.status(400).json({ message: "User already exists" });
		}

		// Create new user
		const user = await User.create({ name, email, password });

		// Generate tokens and store refresh token in Redis
		const { accessToken, refreshToken } = generateTokens(user._id);
		await storeRefreshToken(user._id, refreshToken);

		// Set tokens in cookies
		setCookies(res, accessToken, refreshToken);

		// Respond with user info
		res.status(201).json({
			_id: user._id,
			name: user.name,
			email: user.email,
			role: user.role,
		});
	} catch (error) {
		console.log("Error in signup controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

// ===================== Controller: login =====================
// Handles user login and token generation
export const login = async (req, res) => {
	try {
		const { email, password } = req.body;

		// Find user by email
		const user = await User.findOne({ email });

		// Compare password and proceed if valid
		if (user && (await user.comparePassword(password))) {
			const { accessToken, refreshToken } = generateTokens(user._id);
			await storeRefreshToken(user._id, refreshToken);
			setCookies(res, accessToken, refreshToken);

			res.json({
				_id: user._id,
				name: user.name,
				email: user.email,
				role: user.role,
			});
		} else {
			// Invalid credentials
			res.status(400).json({ message: "Invalid email or password" });
		}
	} catch (error) {
		console.log("Error in login controller", error.message);
		res.status(500).json({ message: error.message });
	}
};

// ===================== Controller: logout =====================
// Clears cookies and deletes refresh token from Redis
export const logout = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;

		// Delete stored token if it exists
		if (refreshToken) {
			const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);
			await redis.del(`refresh_token:${decoded.userId}`);
		}

		// Clear cookies
		res.clearCookie("accessToken");
		res.clearCookie("refreshToken");

		res.json({ message: "Logged out successfully" });
	} catch (error) {
		console.log("Error in logout controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// ===================== Controller: refreshToken =====================
// Issues a new access token using a valid refresh token
export const refreshToken = async (req, res) => {
	try {
		const refreshToken = req.cookies.refreshToken;

		// Check if refresh token is provided
		if (!refreshToken) {
			return res.status(401).json({ message: "No refresh token provided" });
		}

		// Verify token
		const decoded = jwt.verify(refreshToken, process.env.REFRESH_TOKEN_SECRET);

		// Retrieve stored token from Redis and compare
		const storedToken = await redis.get(`refresh_token:${decoded.userId}`);
		if (storedToken !== refreshToken) {
			return res.status(401).json({ message: "Invalid refresh token" });
		}

		// Generate new access token
		const accessToken = jwt.sign({ userId: decoded.userId }, process.env.ACCESS_TOKEN_SECRET, {
			expiresIn: "15m",
		});

		// Set access token in cookie
		res.cookie("accessToken", accessToken, {
			httpOnly: true,
			secure: process.env.NODE_ENV === "production",
			sameSite: "strict",
			maxAge: 15 * 60 * 1000, // 15 minutes
		});

		res.json({ message: "Token refreshed successfully" });
	} catch (error) {
		console.log("Error in refreshToken controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// ===================== Controller: getProfile =====================
// Returns the authenticated user's profile (from middleware)
export const getProfile = async (req, res) => {
	try {
		res.json(req.user);
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};
