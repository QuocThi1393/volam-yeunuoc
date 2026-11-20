// ===== CẤU HÌNH GAME VÕ LÂM YÊU NƯỚC =====
// Bước 1: Dán cấu hình Firebase của anh vào đây (lấy trong Firebase Console > Project settings > Your apps > Web app).
// Khi còn để "DIEN_VAO_DAY", game chạy CHẾ ĐỘ THỬ: lưu trên trình duyệt, đăng nhập tên gì cũng được.
export const FIREBASE_CONFIG = {
  apiKey: "DIEN_VAO_DAY",
  authDomain: "DIEN_VAO_DAY.firebaseapp.com",
  projectId: "DIEN_VAO_DAY",
  storageBucket: "DIEN_VAO_DAY.appspot.com",
  messagingSenderId: "DIEN_VAO_DAY",
  appId: "DIEN_VAO_DAY"
};

// Tên đăng nhập sẽ được ghép thành email: tendangnhap@vlyn.game
// Khi tạo tài khoản trong Firebase Console, nhập email theo dạng này (ví dụ: qthi@vlyn.game).
export const LOGIN_DOMAIN = "vlyn.game";

// Tên đăng nhập của admin (được xem trang Admin). Nhớ sửa giống trong file firestore.rules.
export const ADMIN_USERNAMES = ["qthi"];
