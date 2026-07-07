# IndexedDB Studio - Luồng Hoạt Động & Hướng Dẫn Triển Khai

Tài liệu này mô tả chi tiết kiến trúc, luồng hoạt động (Operation Flow) và cách thức triển khai của ứng dụng **IndexedDB Studio**. 

---

## 1. Luồng Hoạt Động (Operation Flows)

Dưới đây là các sơ đồ Mermaid thể hiện chi tiết luồng xử lý dữ liệu và tương tác của người dùng trong hệ thống.

### A. Luồng truy vấn và hiển thị dữ liệu (Query & View Flow)
Sơ đồ này mô tả cách hệ thống tiếp nhận yêu cầu từ người dùng, quét cấu trúc hoặc thực hiện truy vấn và kết xuất kết quả hiển thị lên giao diện (hỗ trợ cả hai chế độ: **Standard Grid** truyền thống và **Vertical Table View** kiểu DataGrip).

```mermaid
sequenceDiagram
    autonumber
    actor User as Người dùng
    participant UI as Giao diện (Toolbar / Editor / Grid)
    participant Store as State Manager (useAppStore)
    participant Runner as Bộ thực thi (Query Runner)
    participant Adapter as IndexedDB Adapter
    participant IDB as Trình duyệt (IndexedDB Engine)

    User->>UI: Chọn DB/Store hoặc Nhập Truy vấn
    UI->>Store: Gửi câu lệnh truy vấn / Quét metadata
    
    alt Người dùng chạy truy vấn tùy chỉnh (SQL-like query)
        Store->>Runner: Thực thi câu lệnh truy vấn
        Runner->>Adapter: Đọc/Ghi các Object Stores tương ứng
    else Người dùng click chọn Object Store thủ công
        Store->>Adapter: Đọc danh sách bản ghi trực tiếp
    end

    Adapter->>IDB: Mở kết nối DB & Đọc dữ liệu (Cursor / Index)
    IDB-->>Adapter: Trả về mảng dữ liệu thô và keyPath
    Adapter-->>Store: Chuẩn hóa định dạng bản ghi (GridRow[])
    Store-->>UI: Cập nhật State (queryResult, selectedRow, v.v.)
    
    alt Chế độ xem: Standard View (Ngang)
        UI->>User: Kết xuất bảng dữ liệu dạng cột (mặc định)
    else Chế độ xem: Vertical View (Dọc kiểu DataGrip)
        UI->>User: Hoán vị (Transpose) dòng-cột để dễ theo dõi bản ghi dọc
    end
```

---

### B. Luồng cập nhật, sao chép và xóa bản ghi (Write & Mutation Flow)
Sơ đồ mô tả quy trình khi người dùng cập nhật ô trực tiếp, lưu chỉnh sửa JSON thô, thực hiện nhân bản (Clone/Copy) hoặc xóa bản ghi trong cơ sở dữ liệu IndexedDB.

```mermaid
flowchart TD
    A[Bắt đầu thao tác ghi dữ liệu] --> B{Loại hành động?}
    
    B -->|Sửa trực tiếp / Lưu JSON| C[Cập nhật dữ liệu qua Editor]
    B -->|Sao chép / Copy Record| D[Nhấp nút 'Copy' ở Panel Chi Tiết]
    B -->|Xóa bản ghi / Delete| E[Nhấp nút 'Delete']

    C --> C1[Bấm 'Save JSON' / Hoàn tất sửa ô]
    C1 --> C2[useAppStore: updateRecordInStore]
    C2 --> C3[Tạo Snapshot lưu trữ tạm thời]
    C3 --> C4[IndexedDB Adapter: put]
    C4 --> C5[Làm mới kết quả hiển thị runQuery]

    D --> D1[useAppStore: cloneRecordInStore]
    D1 --> D2[Tự động thêm hậu tố _copy_xxxx vào Khóa chính nếu là chuỗi]
    D2 --> D3[Tạo Snapshot lưu trữ tạm thời]
    D3 --> D4[IndexedDB Adapter: add]
    D4 --> C5

    E --> E1[Hiển thị hộp thoại xác nhận]
    E1 --> E2[useAppStore: deleteRecordInStore]
    E2 --> E3[Tạo Snapshot lưu trữ tạm thời]
    E3 --> E4[IndexedDB Adapter: delete]
    E4 --> C5
```

---

## 2. Kiến Trúc Hệ Thống (System Architecture)

IndexedDB Studio được thiết kế để có thể vận hành linh hoạt dưới cả hai dạng: **Ứng dụng Web độc lập (WebApp)** chạy trong sandbox của trình duyệt và **Tiện ích mở rộng Chrome DevTools (Chrome Extension)**.

```mermaid
graph TD
    subgraph "DevTools App Workspace (React & Vite)"
        A[Giao diện React UI] <-->|Đọc/Ghi State| B[Zustand State Store]
        B <-->|Yêu cầu truy xuất| C[Query Runner & IDB Adapter]
    end

    subgraph "Chrome Extension Boundary (Nếu chạy dạng DevTools)"
        C <-->|Gửi tin nhắn qua postMessage| D[Background Script background.js]
        D <-->|Gửi tin nhắn qua sendMessage| E[Content Script / Page Context]
        E <-->|Thực thi mã trực tiếp| F[Trang Web đang được Debug]
    end

    C <-->|Mở kết nối trực tiếp| G[(IndexedDB của Trình duyệt)]
    F <-->|Ghi dữ liệu thật| G

    style A fill:#4f46e5,stroke:#312e81,color:#fff
    style B fill:#3b82f6,stroke:#1d4ed8,color:#fff
    style G fill:#10b981,stroke:#065f46,color:#fff
```

### Các thành phần chính trong mã nguồn:
- **`src/panel/store/useAppStore.ts`**: Đóng vai trò là trung tâm quản lý trạng thái (Zustand), điều phối mọi hành động từ việc chuyển đổi bố cục giao diện, thực thi câu lệnh cho đến cập nhật và sao chép bản ghi.
- **`src/shared/indexeddb-adapter.ts`**: Lớp trừu tượng hóa trực tiếp giao tiếp với IndexedDB của trình duyệt, cung cấp các hàm `add`, `put`, `delete`, quét cơ sở dữ liệu và lấy metadata của các Object Store.
- **`src/shared/query-runner.ts` & `query-parser.ts`**: Biên dịch các câu lệnh SQL-like tùy chỉnh thành các hành động điều hướng Cursor, Index Lookup, Filter phù hợp với kiến trúc NoSQL của IndexedDB.
- **`src/panel/components/ResultGrid.tsx`**: Thành phần hiển thị kết quả truy vấn, tích hợp tính năng hoán vị bảng thành dạng dọc (**Vertical Table View**) giúp người dùng dễ dàng đối chiếu, so sánh các bản ghi có nhiều cột dữ liệu.

---

## 3. Cách Thức Triển Khai (Deployment Guide)

### Bước 1: Cài đặt các gói phụ thuộc
Sử dụng npm để cài đặt đầy đủ các thư viện cần thiết cho việc biên dịch và kiểm thử:
```bash
npm install
```

### Bước 2: Khởi chạy môi trường phát triển (Development)
Chạy server phát triển cục bộ với tính năng cập nhật mã nguồn tức thì:
```bash
npm run dev
```
*Hệ thống sẽ khởi chạy server tại địa chỉ `http://localhost:3000` (hoặc cổng được cấu hình mặc định).*

### Bước 3: Biên dịch sản phẩm (Production Build)
Để tối ưu hóa mã nguồn, đóng gói tài nguyên tĩnh phục vụ cho việc deploy hoặc tích hợp vào tiện ích Chrome Extension:
```bash
npm run build
```
Sau khi tiến trình hoàn tất, các tệp tin phân phối tĩnh sẽ được lưu trữ trong thư mục `/dist`.

### Bước 4: Tích hợp vào Chrome Extension (Nếu cần)
1. Truy cập vào đường dẫn `chrome://extensions/` trên trình duyệt Chrome.
2. Bật chế độ nhà phát triển (**Developer mode**).
3. Chọn mục **Load unpacked** (Tải thư mục đã giải nén).
4. Tìm và chọn thư mục gốc của dự án (nơi có chứa tệp tin `manifest.json` và thư mục `/dist` sau khi build).
