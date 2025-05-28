// Import the Product model
import Product from "../models/product.model.js";

// Controller to get all products in the user's cart
export const getCartProducts = async (req, res) => {
	try {
		// Fetch product details for all IDs in user's cartItems
		const products = await Product.find({ _id: { $in: req.user.cartItems } });

		// Add quantity info to each product object
		const cartItems = products.map((product) => {
			const item = req.user.cartItems.find((cartItem) => cartItem.id === product.id);
			return { ...product.toJSON(), quantity: item.quantity };
		});

		res.json(cartItems);
	} catch (error) {
		console.log("Error in getCartProducts controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Controller to add a product to the cart
export const addToCart = async (req, res) => {
	try {
		const { productId } = req.body; // Get product ID from request body
		const user = req.user;

		// Check if the product is already in cart
		const existingItem = user.cartItems.find((item) => item.id === productId);

		if (existingItem) {
			// If product already in cart, increase quantity
			existingItem.quantity += 1;
		} else {
			// If not, add to cart with default quantity
			user.cartItems.push({ id: productId, quantity: 1 });
		}

		await user.save(); // Save updated user document
		res.json(user.cartItems); // Return updated cart
	} catch (error) {
		console.log("Error in addToCart controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Controller to remove a specific product or all products from the cart
export const removeAllFromCart = async (req, res) => {
	try {
		const { productId } = req.body;
		const user = req.user;

		if (!productId) {
			// If no productId provided, remove all items
			user.cartItems = [];
		} else {
			// Remove only the specified product
			user.cartItems = user.cartItems.filter((item) => item.id !== productId);
		}

		await user.save(); // Save changes
		res.json(user.cartItems); // Return updated cart
	} catch (error) {
		res.status(500).json({ message: "Server error", error: error.message });
	}
};

// Controller to update quantity of a specific product in the cart
export const updateQuantity = async (req, res) => {
	try {
		const { id: productId } = req.params; // Get product ID from URL params
		const { quantity } = req.body; // Get new quantity from body
		const user = req.user;

		// Find the item in the cart
		const existingItem = user.cartItems.find((item) => item.id === productId);

		if (existingItem) {
			if (quantity === 0) {
				// If quantity is zero, remove item from cart
				user.cartItems = user.cartItems.filter((item) => item.id !== productId);
				await user.save();
				return res.json(user.cartItems);
			}

			// Otherwise, update quantity
			existingItem.quantity = quantity;
			await user.save();
			res.json(user.cartItems);
		} else {
			// If item not found, return error
			res.status(404).json({ message: "Product not found" });
		}
	} catch (error) {
		console.log("Error in updateQuantity controller", error.message);
		res.status(500).json({ message: "Server error", error: error.message });
	}
};
