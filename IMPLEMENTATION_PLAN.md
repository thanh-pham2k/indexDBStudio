# Cải thiện xem/sửa record, sao chép dữ liệu và truy vấn field

## Tóm tắt

Chuyển toàn bộ thao tác record sang modal khi double-click, bỏ panel detail phía dưới; thêm tìm kiếm table trong database hiện tại; thêm sao chép toàn bộ kết quả table dưới dạng JSON; sửa autocomplete field để nhận đúng table trong `FROM`. Giao diện mặc định dùng Vertical Table View.

## Thay đổi chính

- Đặt `Vertical Table View` là chế độ hiển thị mặc định của result table mỗi khi mở ứng dụng.
- Bỏ nút `Add Record` khỏi thanh thao tác cạnh nút `Horizontal/Vertical View`; không thay đổi chức năng thêm record nào khác vì hiện chưa có điểm truy cập thay thế.
- Bỏ `JsonDetailPanel` khỏi bố cục chính.
- Nâng modal JSON trong `ResultGrid` thành trình xem/sửa record:
  - Double-click dòng mở modal với JSON được format.
  - Có Copy, Edit, Save, Delete và Close.
  - JSON mặc định chỉ đọc; Edit mở chỉnh sửa; Save chỉ ghi khi JSON hợp lệ.
  - Lỗi JSON hoặc lỗi IndexedDB giữ modal mở và hiển thị lỗi; lưu thành công cập nhật lại grid/metadata.
  - Delete vẫn yêu cầu xác nhận và đóng modal sau khi xóa thành công.
- Thêm ô tìm kiếm không phân biệt hoa/thường cạnh bộ chọn table trong `Toolbar`; danh sách table chỉ hiển thị các tên khớp trong database đang chọn. Chọn table vẫn đồng bộ query mặc định như hiện tại.
- Thêm nút `Copy JSON` tại thanh thao tác của result table, cạnh nút chuyển `Horizontal/Vertical View`:
  - Sao chép toàn bộ record của kết quả query hiện tại vào clipboard dưới dạng JSON được format.
  - Dữ liệu copy là các record gốc, không gồm metadata nội bộ như `__key`, `__dbName`, `__storeName`, `__keyPath`.
  - Hiển thị trạng thái `Copied` tạm thời; vô hiệu hóa nút khi không có kết quả.
- Sửa autocomplete trong `QueryEditor`:
  - Xác định table nguồn từ `FROM` trong nội dung query, thay vì chỉ dùng table đang chọn trên toolbar.
  - Dùng field của table nguồn cho `SELECT`, `WHERE`, `AND` và `ORDER BY`.
  - Giữ lọc gợi ý theo phần field đang gõ và đảm bảo chọn gợi ý thay đúng token tại con trỏ.
  - Không đổi logic thực thi SELECT/WHERE hiện có; bảo đảm parser và executor chạy giống nhau ở local và Chrome DevTools.

## Kiểm thử

- Chạy TypeScript lint/build.
- Mở mới ứng dụng: result table mặc định là Vertical Table View.
- Xác nhận nút và form thêm record không còn trong result table.
- Kiểm tra Copy JSON sao chép đủ tất cả record của query, JSON parse được và không chứa metadata nội bộ.
- Kiểm tra double-click record, Copy JSON, Edit JSON hợp lệ rồi Save; JSON không hợp lệ phải không ghi dữ liệu.
- Kiểm tra Delete từ modal, xác nhận kết quả grid và modal.
- Tìm table theo một phần tên, đổi database và bảo đảm bộ lọc được làm mới.
- Chạy `SELECT field1, field2 FROM table WHERE field = ...`, với tên field được autocomplete từ table trong `FROM`; kiểm tra cả local fallback và DevTools extension.

## Giả định

- Giữ Delete trong modal.
- Tìm kiếm table chỉ trong database đang chọn.
- Save ghi đè toàn bộ JSON record, theo cơ chế cập nhật record hiện tại.
- “Copy tất cả record” nghĩa là copy toàn bộ kết quả query hiện tại, không chỉ trang đang hiển thị.
