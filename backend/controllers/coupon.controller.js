// Import the Coupon model
import Coupon from "../models/coupon.model.js";

// Controller to get the currently active coupon for the user
export const getCoupon = async (req, res) => {
	try {
		// Find one active coupon for the current user
		const coupon = await Coupon.findOne({ userId: req.user._id, isActive: true });

		// If found, return it; otherwise return null
		res.json(coupon || null);
	} catch (error) {
		console.log("Error in getCoupon controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Controller to validate a coupon code
export const validateCoupon = async (req, res) => {
	try {
		const { code } = req.body; // Extract coupon code from request body

		// Search for a matching coupon assigned to the current user, that is active
		const coupon = await Coupon.findOne({ code: code, userId: req.user._id, isActive: true });

		// If coupon not found, return 404
		if (!coupon) {
			return res.status(404).json({ message: "Coupon not found" });
		}

		// If coupon has expired, mark it as inactive and return 404
		if (coupon.expirationDate < new Date()) {
			coupon.isActive = false;
			await coupon.save(); // Save changes
			return res.status(404).json({ message: "Coupon expired" });
		}

		// If everything is valid, return coupon details
		res.json({
			message: "Coupon is valid",
			code: coupon.code,
			discountPercentage: coupon.discountPercentage,
		});
	} catch (error) {
		console.log("Error in validateCoupon controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};
