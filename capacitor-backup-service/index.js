// এই প্যাকেজের কোনো JS API ইচ্ছাকৃতভাবে এক্সপোর্ট করা হয়নি।
// App.jsx (এই কোডবেসের বাকি সব কাস্টম/কমিউনিটি প্লাগইনের মতোই — দেখুন
// BluetoothSerial ব্যবহারের প্যাটার্ন) সরাসরি window.Capacitor.Plugins.BackupService
// দিয়ে কল করে, যেটা Capacitor bridge রানটাইমে অটো-এক্সপোজ করে (এই প্যাকেজের
// android/ ফোল্ডারে থাকা @CapacitorPlugin(name = "BackupService") ক্লাস থেকে)।
// এই ফাইলটা শুধু npm/Node module resolution ঠিক রাখার জন্য উপস্থিত।
module.exports = {};
