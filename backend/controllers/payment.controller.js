// Import models and stripe configuration
import Coupon from "../models/coupon.model.js";
import Order from "../models/order.model.js";
import { stripe } from "../lib/stripe.js";

// Controller to create a Stripe checkout session
export const createCheckoutSession = async (req, res) => {
	try {
		const { products, couponCode } = req.body;

		// Validate products array
		if (!Array.isArray(products) || products.length === 0) {
			return res.status(400).json({ error: "Invalid or empty products array" });
		}

		let totalAmount = 0;

		// Prepare line items for Stripe and calculate total amount
		const lineItems = products.map((product) => {
			const amount = Math.round(product.price * 100); // Stripe uses cents
			totalAmount += amount * product.quantity;

			return {
				price_data: {
					currency: "usd",
					product_data: {
						name: product.name,
						images: [product.image], // Optional: product image for Stripe UI
					},
					unit_amount: amount,
				},
				quantity: product.quantity || 1,
			};
		});

		let coupon = null;
		if (couponCode) {
			// Check if coupon is valid and belongs to the user
			coupon = await Coupon.findOne({ code: couponCode, userId: req.user._id, isActive: true });

			// Apply coupon discount if found
			if (coupon) {
				totalAmount -= Math.round((totalAmount * coupon.discountPercentage) / 100);
			}
		}

		// Create Stripe checkout session
		const session = await stripe.checkout.sessions.create({
			payment_method_types: ["card"],
			line_items: lineItems,
			mode: "payment",
			success_url: `${process.env.CLIENT_URL}/purchase-success?session_id={CHECKOUT_SESSION_ID}`, // redirect after success
			cancel_url: `${process.env.CLIENT_URL}/purchase-cancel`, // redirect after cancel

			// Apply Stripe coupon if one exists
			discounts: coupon
				? [
						{
							coupon: await createStripeCoupon(coupon.discountPercentage),
						},
				  ]
				: [],

			// Metadata passed for future reference (e.g., creating orders)
			metadata: {
				userId: req.user._id.toString(),
				couponCode: couponCode || "",
				products: JSON.stringify(
					products.map((p) => ({
						id: p._id,
						quantity: p.quantity,
						price: p.price,
					}))
				),
			},
		});

		// If user spent >= $200 (20000 cents), generate a new gift coupon
		if (totalAmount >= 20000) {
			await createNewCoupon(req.user._id);
		}

		// Send session ID and total amount (in dollars) to frontend
		res.status(200).json({ id: session.id, totalAmount: totalAmount / 100 });
	} catch (error) {
		console.error("Error processing checkout:", error);
		res.status(500).json({ message: "Error processing checkout", error: error.message });
	}
};

// Controller to handle success logic after Stripe payment
export const checkoutSuccess = async (req, res) => {
	try {
		const { sessionId } = req.body;

		// Retrieve the session info from Stripe
		const session = await stripe.checkout.sessions.retrieve(sessionId);

		if (session.payment_status === "paid") {
			// If a coupon was used, deactivate it for this user
			if (session.metadata.couponCode) {
				await Coupon.findOneAndUpdate(
					{
						code: session.metadata.couponCode,
						userId: session.metadata.userId,
					},
					{
						isActive: false,
					}
				);
			}

			// Extract product info from session metadata
			const products = JSON.parse(session.metadata.products);

			// Create a new order in the database
			const newOrder = new Order({
				user: session.metadata.userId,
				products: products.map((product) => ({
					product: product.id,
					quantity: product.quantity,
					price: product.price,
				})),
				totalAmount: session.amount_total / 100, // Convert to dollars
				stripeSessionId: sessionId,
			});

			// Save the new order
			await newOrder.save();

			// Respond to frontend with success
			res.status(200).json({
				success: true,
				message: "Payment successful, order created, and coupon deactivated if used.",
				orderId: newOrder._id,
			});
		}
	} catch (error) {
		console.error("Error processing successful checkout:", error);
		res.status(500).json({ message: "Error processing successful checkout", error: error.message });
	}
};

// Helper to create a Stripe coupon object dynamically
async function createStripeCoupon(discountPercentage) {
	const coupon = await stripe.coupons.create({
		percent_off: discountPercentage, // percentage discount
		duration: "once", // valid for one use
	});
	return coupon.id; // Return Stripe coupon ID to attach in session
}

// Helper to create a new gift coupon for a user
async function createNewCoupon(userId) {
	// Remove existing coupon if any (only one allowed per user)
	await Coupon.findOneAndDelete({ userId });

	// Create new coupon with 10% discount valid for 30 days
	const newCoupon = new Coupon({
		code: "GIFT" + Math.random().toString(36).substring(2, 8).toUpperCase(), // random code
		discountPercentage: 10,
		expirationDate: new Date(Date.now() + 30 * 24 * 60 * 60 * 1000), // expires in 30 days
		userId: userId,
	});

	// Save to DB
	await newCoupon.save();

	return newCoupon;
}
