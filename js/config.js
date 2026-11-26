// ===== CẤU HÌNH GAME VÕ LÂM YÊU NƯỚC =====
// Bước 1: Dán cấu hình Firebase của anh vào đây (lấy trong Firebase Console > Project settings > Your apps > Web app).
// Khi còn để "DIEN_VAO_DAY", game chạy CHẾ ĐỘ THỬ: lưu trên trình duyệt, đăng nhập tên gì cũng được.
export const FIREBASE_CONFIG = {
  apiKey: "AIzaSyAV-LhsK2gTbjbWTbQktfLTssXo6ZCswsQ",
  authDomain: "volam-yeunuoc.firebaseapp.com",
  projectId: "volam-yeunuoc",
  storageBucket: "volam-yeunuoc.firebasestorage.app.appspot.com",
  messagingSenderId: "554918308125",
  appId: "1:554918308125:web:85b3c63fc03b1bf94359f4",
  // Bản 2.2 (chơi chung): địa chỉ Realtime Database, dạng https://ten-du-an-default-rtdb.asia-southeast1.firebasedatabase.app
  databaseURL: "https://volam-yeunuoc-default-rtdb.asia-southeast1.firebasedatabase.app"
};

// Tên đăng nhập sẽ được ghép thành email: tendangnhap@vlyn.game
// Khi tạo tài khoản trong Firebase Console, nhập email theo dạng này (ví dụ: qthi@vlyn.game).
export const LOGIN_DOMAIN = "vlyn.game";

// Tên đăng nhập của admin (được xem trang Admin). Nhớ sửa giống trong file firestore.rules.
export const ADMIN_USERNAMES = ["qthi"];
