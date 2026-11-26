# Võ Lâm Yêu Nước — Hướng dẫn cài đặt (bản 2.2)

## 1. Đưa game lên GitHub Pages
1. Tạo repo mới, ví dụ `volam-yeunuoc`.
2. Upload toàn bộ, giữ nguyên thư mục:
   - `index.html`
   - `gamedata.json` (để **cạnh** `index.html`; game đọc mọi chỉ số, hình, icon từ file này)
   - `editor.html` (trang soạn dữ liệu)
   - `css/style.css`
   - `js/` (8 file: config, data, logic, icons, store, net, battle, main)
   - `firestore.rules` và `database.rules.json` (không bắt buộc upload, chỉ để copy nội dung)
3. Vào Settings → Pages → Branch: `main` → Save.
4. Mở `https://quocthi1393.github.io/volam-yeunuoc/`.

Lúc này game đang chạy **chế độ thử**: đăng nhập tên gì cũng được, dữ liệu lưu trên trình duyệt. Chơi thử trước cũng được.

### Sửa dữ liệu game
1. Mở `editor.html` → **Mở file gamedata.json** → sửa (dán icon bằng Ctrl+V).
2. Bấm **Xuất gamedata.json** → upload đè file `gamedata.json` trên GitHub. Không cần sửa code.
3. Thiếu hình ở đâu thì game tự vẽ ô thay thế.
4. Hình đạn của skill (mục Kỹ năng): dán vào ô **Hình 1**, **Hình 2**, **Khung 1–4**. Editor tự cắt sát hình và thu về tối đa 64px. Mũi hình chưa chỉ đúng hướng bay thì sửa ô **Góc xoay** (hình mũi chỉ lên trên: 90; chỉ chéo lên phải: 45). Hình nét đen thì chọn **Tô đậm theo màu hệ** cho dễ thấy trên nền tối.

### Nhân vật bản 1
Bản 2.0 đổi cấu trúc nhân vật, nên nhân vật tạo ở bản 1 phải **tạo lại**. Game tự báo khi gặp nhân vật cũ.

## 2. Tạo Firebase (miễn phí, gói Spark)
Menu bên trái của Firebase Console (bản mới): **Authentication** nằm trong nhóm **Security**; **Firestore** và **Realtime Database** nằm trong nhóm **Databases & Storage**.

1. Vào https://console.firebase.google.com → **Create a project** (hoặc Add project) → đặt tên (ví dụ `volam-yeunuoc`), tắt Google Analytics cũng được.
2. **Security → Authentication** → Get started → tab *Sign-in method* → bật **Email/Password** (chỉ bật dòng đầu) → Save.
3. **Authentication → Settings → User actions**: nếu project của anh có mục này, bỏ chọn **Enable create (sign-up)** để người lạ không tự tạo được tài khoản.
4. **Databases & Storage → Firestore** → Create database → nếu hỏi phiên bản thì chọn **Standard** → vùng `asia-southeast1` (Singapore) → **Production mode** → Create.
5. Firestore → tab **Rules** → xóa hết, dán nội dung file `firestore.rules` → **Publish**. Bản 2.1 có thêm luật cho **Chợ** (`market`, `payouts`), nhớ dán bản mới.
6. **Project settings** (bánh răng) → *Your apps* → bấm biểu tượng **</>** (Web) → đặt tên → Register. Firebase hiện đoạn `firebaseConfig = {...}`.
7. Mở `js/config.js`, thay các dòng `DIEN_VAO_DAY` bằng giá trị trong đoạn đó, rồi upload lại file này lên GitHub. Dòng `databaseURL` xem mục 7 (chơi chung).
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
Có 2 kiểu, đổi ở nút **Điều khiển** trên thanh trên cùng, hoặc trong trận bấm Esc rồi C.

| Việc | Kiểu A (WASD) | Kiểu B (chuột để đi) |
|---|---|---|
| Di chuyển | WASD | Bấm chuột trái để đi tới điểm đó, giữ để đi theo chuột |
| Chiêu chính | Giữ chuột trái | Giữ Q |
| Chiêu phụ | Chuột phải | W |
| Buff / debuff | Q | E |
| Để dành | — | R (chiêu sau này) |
| Lướt né | Space | Space (lướt về phía chuột) |
| Thuốc | 1 / 2 / 3 | 1 / 2 / 3 |
| Tạm dừng | Esc (F bỏ chạy, C đổi điều khiển, G đồ họa, P hiện FPS) | như kiểu A |

- Sân đánh rộng hơn màn hình, camera chạy theo nhân vật. Boss ra ngoài khung thì có mũi tên chỉ hướng.
- Máy yếu: nút Điều khiển → Đồ họa **Thấp** (bỏ hình nền và hiệu ứng phụ), bật **Hiện FPS** để xem số khung hình mỗi giây.
- Vạn Kiếm Quy Tông: bấm chiêu phụ lần nữa để gọi kiếm về sớm.

- Cầm sai vũ khí thì chiêu hiện chữ đỏ "Cần …" và không dùng được.
- Vé boss Hoàng Kim bị trừ ngay khi vào trận, kể cả khi thua hoặc bỏ chạy.
- Có Cửu Chuyển Hoàn Hồn Đan trong túi thì chết lần đầu sẽ tự hồi sinh.

Chấm đỏ giữa người là điểm trúng đạn.

## 6. Chợ
- Rao bán: Túi đồ → bấm món muốn bán → **Rao bán ở Chợ** → đặt giá. Mỗi người tối đa 10 món, không thu thuế, không giới hạn thời gian.
- Món đang rao rời khỏi túi. Rút về ở tab Chợ khi túi còn chỗ. Đồ đã khóa phải mở khóa mới rao được.
- Người bán đang offline vẫn nhận vàng ở lần vào game sau.
- Chế độ thử: chỉ thấy hàng giữa các tài khoản trên cùng một trình duyệt. Muốn bạn bè thấy hàng của nhau thì phải bật Firebase thật (mục 2).

## 7. Chơi chung: tab Tổ đội (bản 2.2)
Tab **Tổ đội** cho thấy ai đang online (treo máy, đánh boss hay trong phòng) và có **phòng thử** tối đa 5 người: thấy nhau đi lại, ra chiêu, cùng đánh 1 mộc nhân có máu chung. Chiêu của người khác chỉ để nhìn, không trúng mình. Rời phòng: Esc → F. Ẩn tab quá 1 phút thì tự rời phòng.

### Bật Realtime Database (làm 1 lần, sau mục 2)
1. Firebase Console → **Databases & Storage → Realtime Database** → **Create Database**.
2. Vùng: **Singapore (asia-southeast1)** cho ping thấp → chọn **Start in locked mode** → Enable.
3. Tab **Rules** → xóa hết, dán nội dung file `database.rules.json` → **Publish**.
4. Tab **Data**: dòng trên cùng là địa chỉ dạng `https://ten-du-an-default-rtdb.asia-southeast1.firebasedatabase.app`. Copy địa chỉ đó dán vào dòng `databaseURL` trong `js/config.js`, upload lại `config.js`.
   (Nếu anh tạo Realtime Database **trước** bước 6 của mục 2 thì đoạn `firebaseConfig` đã có sẵn dòng `databaseURL`.)
5. Chưa làm bước này thì tab Tổ đội báo "Chưa bật phần chơi chung"; treo máy, lưu nhân vật, Chợ vẫn chạy bình thường.

### Chi phí (gói miễn phí Spark, không cần thẻ)
- Không gắn thẻ nên không bao giờ bị trừ tiền. Dùng lố thì tính năng đó tạm ngưng.
- Đo thử 5 người vừa chạy vừa đánh liên tục: khoảng 60 MB mỗi giờ cho cả phòng. Firebase tính thêm phần đóng gói nên thực tế có thể 100–150 MB/giờ. Gói miễn phí cho 10 GB/tháng, tức khoảng 70–100 giờ chơi chung mỗi tháng. Lố thì chỉ phòng chơi chung bị khóa tới tháng sau.
- Xem số thật: Realtime Database → tab **Usage**. Trong phòng, góc dưới bên phải màn hình có số nhỏ: độ trễ (ms) và dữ liệu đã nhận (MB).
- Game tự lưu nhân vật 5 phút 1 lần (thao tác quan trọng như mặc đồ, nâng skill, đánh boss xong vẫn lưu ngay). Tắt web khi treo máy thì không tốn lượt lưu nào.
- Lưu lên Firebase bị lỗi (mất mạng, hết hạn mức ngày) thì game lưu tạm trong máy, lần sau tự đẩy lên.

### Thử nhiều người trên 1 máy (chế độ thử)
- Chưa có Firebase cũng thử được: mở 2–5 tab cùng địa chỉ game, mỗi tab đăng nhập 1 tên khác nhau (mỗi tab nhớ tài khoản riêng). Tab mới mở sẽ tự vào tài khoản vừa dùng: bấm **Đăng xuất** rồi đăng nhập tên khác.
- Vào tab Tổ đội ở tab thứ nhất → **+ Tạo phòng**; các tab khác bấm **Vào**.

### Chuyển nhân vật chơi thử lên Firebase
Lần đầu đăng nhập Firebase mà tài khoản chưa có nhân vật, màn tạo nhân vật có nút chuyển nhân vật chơi ở chế độ thử (còn trên trình duyệt đó) lên tài khoản.

## 8. Kỹ năng: 3 tầng sau cấp tối đa
- Mỗi skill sau cấp 10 còn 3 tầng (cấp 11–13). Mỗi tầng tốn 2 điểm skill và gấp đôi ngọc. Một đường max hết tốn 80 điểm, nhân vật cấp 99 có khoảng 100 điểm nên phải chọn.
- Số tầng, số điểm, hệ số ngọc sửa trong editor → Cài đặt chung.
- Tab kỹ năng: 2 tab đường (tên phái + vũ khí, sửa được trong editor → Môn phái → "Tên tab kỹ năng"), tab Bí kíp và Bí kíp giang hồ.

