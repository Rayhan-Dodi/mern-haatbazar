// Importing MongoDB models for interacting with the database
import Order from "../models/order.model.js";
import Product from "../models/product.model.js";
import User from "../models/user.model.js";

// ==================== Function: getAnalyticsData ====================
export const getAnalyticsData = async () => {
	// Count total users in the 'users' collection
	const totalUsers = await User.countDocuments();

	// Count total products in the 'products' collection
	const totalProducts = await Product.countDocuments();

	// Aggregate total sales and total revenue from the 'orders' collection
	const salesData = await Order.aggregate([
		{
			$group: {
				_id: null, // Group all orders together (no specific field)
				totalSales: { $sum: 1 }, // Count total number of orders
				totalRevenue: { $sum: "$totalAmount" }, // Sum all order amounts
			},
		},
	]);

	// Destructure result or default to 0 if no sales data is found
	const { totalSales, totalRevenue } = salesData[0] || { totalSales: 0, totalRevenue: 0 };

	// Return analytics summary
	return {
		users: totalUsers,
		products: totalProducts,
		totalSales,
		totalRevenue,
	};
};

// ==================== Function: getDailySalesData ====================
export const getDailySalesData = async (startDate, endDate) => {
	try {
		// Aggregate orders created between startDate and endDate
		const dailySalesData = await Order.aggregate([
			{
				$match: {
					createdAt: {
						$gte: startDate, // Filter orders from startDate
						$lte: endDate,   // to endDate
					},
				},
			},
			{
				$group: {
					// Group by day (formatted as 'YYYY-MM-DD')
					_id: { $dateToString: { format: "%Y-%m-%d", date: "$createdAt" } },
					sales: { $sum: 1 }, // Count orders per day
					revenue: { $sum: "$totalAmount" }, // Sum revenue per day
				},
			},
			{ $sort: { _id: 1 } }, // Sort by date ascending
		]);

		/**
		 * dailySalesData Example:
		 * [
		 *   { _id: "2024-08-18", sales: 12, revenue: 1450.75 },
		 *   ...
		 * ]
		 */

		// Generate all dates between startDate and endDate
		const dateArray = getDatesInRange(startDate, endDate);
		// Example output: ['2024-08-18', '2024-08-19', ...]

		// Return sales data for each date in the range
		return dateArray.map((date) => {
			const foundData = dailySalesData.find((item) => item._id === date);

			return {
				date, // Date string
				sales: foundData?.sales || 0, // Sales count or 0
				revenue: foundData?.revenue || 0, // Revenue or 0
			};
		});
	} catch (error) {
		// Propagate error to caller
		throw error;
	}
};

// ==================== Helper Function: getDatesInRange ====================
function getDatesInRange(startDate, endDate) {
	const dates = [];
	let currentDate = new Date(startDate);

	// Generate each date from start to end
	while (currentDate <= endDate) {
		dates.push(currentDate.toISOString().split("T")[0]); // Format: 'YYYY-MM-DD'
		currentDate.setDate(currentDate.getDate() + 1); // Move to next day
	}

	// Return array of date strings
	return dates;
}

/*
📌 Summary:
Purpose of this module:
To provide analytics data for a dashboard — including total users, products, sales, revenue, and daily trends.

Why use aggregation?
To efficiently calculate statistics from MongoDB collections (like counting orders or summing revenue).

Why getDatesInRange?
To ensure charts/graphs have consistent data points for all days — even if no sales occurred on some.
*/
