# Võ Lâm Yêu Nước — Hướng dẫn cài đặt (giai đoạn 1)

## 1. Đưa game lên GitHub Pages
1. Tạo repo mới, ví dụ `volam-yeunuoc`.
2. Upload toàn bộ, giữ nguyên thư mục:
   - `index.html`
   - `css/style.css`
   - `js/` (7 file: config, data, logic, icons, store, battle, main)
   - `firestore.rules` (không bắt buộc upload, chỉ để copy nội dung)
3. Vào Settings → Pages → Branch: `main` → Save.
4. Mở `https://quocthi1393.github.io/volam-yeunuoc/`.

Lúc này game đang chạy **chế độ thử**: đăng nhập tên gì cũng được, dữ liệu lưu trên trình duyệt. Chơi thử trước cũng được.

## 2. Tạo Firebase (miễn phí, gói Spark)
1. Vào https://console.firebase.google.com → **Add project** → đặt tên (ví dụ `volam-yeunuoc`), tắt Google Analytics cũng được.
2. **Authentication** → Get started → tab *Sign-in method* → bật **Email/Password** (chỉ bật dòng đầu).
3. **Authentication → Settings → User actions**: nếu project của anh có mục này, bỏ chọn **Enable create (sign-up)** để người lạ không tự tạo được tài khoản.
4. **Firestore Database** → Create database → chọn vùng `asia-southeast1` (Singapore) → Production mode.
5. Firestore → tab **Rules** → xóa hết, dán nội dung file `firestore.rules` → **Publish**.
6. **Project settings** (bánh răng) → *Your apps* → bấm biểu tượng **</>** (Web) → đặt tên → Register. Firebase hiện đoạn `firebaseConfig = {...}`.
7. Mở `js/config.js`, thay 6 dòng `DIEN_VAO_DAY` bằng giá trị trong đoạn đó, rồi upload lại file này lên GitHub.
8. **Authentication → Settings → Authorized domains** → Add domain → `quocthi1393.github.io`.

## 3. Tạo tài khoản người chơi
- Authentication → Users → **Add user**
  - Email: `tendangnhap@vlyn.game` (ví dụ `qthi@vlyn.game`). Domain này không cần tồn tại thật.
  - Mật khẩu: từ 6 ký tự.
- Người chơi đăng nhập bằng **tên đăng nhập** (`qthi`), không cần gõ `@vlyn.game`.
- Người chơi tự đổi mật khẩu trong game bằng nút **Đổi mật khẩu**.

## 4. Admin
- `js/config.js` → `ADMIN_USERNAMES = ["qthi"]`
- `firestore.rules` → `['qthi@vlyn.game']`
- Hai chỗ phải khớp nhau. Muốn thêm admin thì thêm vào cả hai chỗ, sau đó Publish lại rules.

## 5. Điều khiển khi đánh boss
| Phím | Tác dụng |
|---|---|
| WASD | Di chuyển |
| Giữ chuột trái | Nguyệt Đao Trảm |
| Chuột phải | Sư Tử Hống: sát thương vùng tam giác, xóa đạn |
| Q | Kim Cang Hộ Thể: khiên chặn đạn |
| Space | Lướt né, bất tử trong chốc lát |
| Esc | Tạm dừng. Đang tạm dừng bấm F để bỏ chạy |

Chấm đỏ giữa người là điểm trúng đạn.
