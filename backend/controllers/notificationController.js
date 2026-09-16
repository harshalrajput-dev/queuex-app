const Notification = require("../models/Notification");
const { ok, fail } = require("../utils/response");
const ah = require("../utils/asyncHandler");

exports.listMyNotifications = ah(async (req, res) => {
  const unread = await Notification.countDocuments({ userId: req.user._id, read: false });
  const notifications = await Notification.find({ userId: req.user._id })
    .sort({ createdAt: -1 })
    .limit(50);
  return ok(res, { notifications, unreadCount: unread }, "Notifications");
});

exports.markRead = ah(async (req, res) => {
  const notification = await Notification.findOneAndUpdate(
    { _id: req.params.id, userId: req.user._id },
    { read: true },
    { new: true }
  );
  if (!notification) return fail(res, "Notification not found", 404);
  return ok(res, notification, "Marked as read");
});

exports.markAllRead = ah(async (req, res) => {
  await Notification.updateMany({ userId: req.user._id, read: false }, { read: true });
  return ok(res, null, "All notifications marked as read");
});
