<p align="center">
  <img src="public/banner.png" alt="waoowaoo" width="600">
</p>

<h1 align="center">waoowaoo AI Phim Studio 🎬</h1>

<p align="center">
  Công cụ sản xuất phim ngắn/video manga bằng AI — hỗ trợ từ phân tích tiểu thuyết tự động tạo phân cảnh, nhân vật, bối cảnh, và sản xuất thành video hoàn chỉnh.
</p>

<p align="center">
  <a href="README_en.md">English</a> · <a href="README_zh.md">中文</a> · <a href="https://github.com/nguyenduchoai/waoowaoo/issues">Báo lỗi</a>
</p>

> [!IMPORTANT]
> ⚠️ **Phiên bản thử nghiệm**: Dự án đang trong giai đoạn thử nghiệm ban đầu. Chúng tôi đang cập nhật nhanh chóng, **hoan nghênh mọi phản hồi và đề xuất!** Hiện tại cập nhật rất thường xuyên, sắp tới sẽ bổ sung nhiều tính năng mới và tối ưu hiệu quả. Mục tiêu là trở thành công cụ AI mạnh nhất trong ngành!

---

## 👤 Giới thiệu

Xin chào! Mình là **Hoài Nguyễn** (Nguyen Duc Hoai) 🇻🇳

- 🔗 GitHub: [github.com/nguyenduchoai](https://github.com/nguyenduchoai)
- 📧 Email: nguyenduchoai@gmail.com
- 💼 Đam mê xây dựng các sản phẩm AI và công nghệ sáng tạo
- 🎯 Fork và Việt hoá dự án waoowaoo để mang công cụ AI sản xuất phim đến cộng đồng Việt Nam

> Dự án này được fork từ [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo) và đã được **Việt hoá hoàn toàn** giao diện người dùng với hơn 2,500 chuỗi dịch.

---

## ✨ Tính năng nổi bật

- 🎬 **Phân tích kịch bản AI** — Tự động phân tích tiểu thuyết, trích xuất nhân vật, bối cảnh, cốt truyện
- 🎨 **Tạo nhân vật & bối cảnh** — AI tạo hình ảnh nhân vật và bối cảnh nhất quán
- 📽️ **Sản xuất phân cảnh** — Tự động tạo phân cảnh và tổng hợp video
- 🎙️ **Lồng tiếng AI** — Tổng hợp giọng nói đa nhân vật
- 🌐 **Đa ngôn ngữ** — Tiếng Việt 🇻🇳 / Tiếng Trung 🇨🇳 / Tiếng Anh 🇺🇸, chuyển đổi một chạm

---

## 🚀 Bắt đầu nhanh

**Yêu cầu trước**: Cài đặt [Docker Desktop](https://docs.docker.com/get-docker/)

### Cách 1: Pull image có sẵn (đơn giản nhất)

Không cần clone repo, tải về và dùng ngay:

```bash
# Tải docker-compose.yml
curl -O https://raw.githubusercontent.com/nguyenduchoai/waoowaoo/main/docker-compose.yml

# Khởi động tất cả dịch vụ
docker compose up -d
```

> ⚠️ Đang là bản thử nghiệm, dữ liệu giữa các phiên bản không tương thích. Nâng cấp hãy xoá dữ liệu cũ:

```bash
docker compose down -v
docker rmi ghcr.io/saturndec/waoowaoo:latest
curl -O https://raw.githubusercontent.com/nguyenduchoai/waoowaoo/main/docker-compose.yml
docker compose up -d
```

> Sau khi khởi động hãy **xoá cache trình duyệt** và đăng nhập lại.

### Cách 2: Clone repo + Docker build (toàn quyền kiểm soát)

```bash
git clone https://github.com/nguyenduchoai/waoowaoo.git
cd waoowaoo
docker compose up -d
```

Cập nhật phiên bản:
```bash
git pull
docker compose down && docker compose up -d --build
```

### Cách 3: Chế độ phát triển (dành cho developer)

```bash
git clone https://github.com/nguyenduchoai/waoowaoo.git
cd waoowaoo
npm install

# Chỉ khởi động hạ tầng cơ bản
docker compose up mysql redis minio -d

# Chạy database migration
npx prisma db push

# Khởi động dev server
npm run dev
```

---

Truy cập [http://localhost:13000](http://localhost:13000) (cách 1, 2) hoặc [http://localhost:3000](http://localhost:3000) (cách 3) để bắt đầu!

> Lần đầu khởi động sẽ tự động hoàn tất khởi tạo database, không cần cấu hình thêm.

> [!TIP]
> **Nếu trang web bị chậm**: Chế độ HTTP có thể bị trình duyệt giới hạn kết nối đồng thời. Có thể cài [Caddy](https://caddyserver.com/docs/install) để bật HTTPS:
> ```bash
> caddy run --config Caddyfile
> ```
> Sau đó truy cập [https://localhost:1443](https://localhost:1443)

---

## 🔧 Cấu hình API

Sau khi khởi động, vào **Trung tâm cài đặt** để cấu hình API Key cho dịch vụ AI, có hướng dẫn tích hợp sẵn.

> 💡 **Lưu ý**: Hiện tại khuyến nghị sử dụng API chính thức của các nhà cung cấp. Định dạng tương thích bên thứ ba (OpenAI Compatible) chưa hoàn thiện, sẽ được tối ưu trong các phiên bản sau.

---

## 📦 Technology Stack

- **Framework**: Next.js 15 + React 19
- **Database**: MySQL + Prisma ORM
- **Queue**: Redis + BullMQ
- **Styling**: Tailwind CSS v4
- **Auth**: NextAuth.js
- **i18n**: next-intl (Việt / Trung / Anh)

---

## 📦 Xem trước giao diện

![4f7b913264f7f26438c12560340e958c67fa833a](https://github.com/user-attachments/assets/fa0e9c57-9ea0-4df3-893e-b76c4c9d304b)
![67509361cbe6809d2496a550de5733b9f99a9702](https://github.com/user-attachments/assets/f2fb6a64-5ba8-4896-a064-be0ded213e42)
![466e13c8fd1fc799d8f588c367ebfa24e1e99bf7](https://github.com/user-attachments/assets/09bbff39-e535-4c67-80a9-69421c3b05ee)
![c067c197c20b0f1de456357c49cdf0b0973c9b31](https://github.com/user-attachments/assets/688e3147-6e95-43b0-b9e7-dd9af40db8a0)

---

## 🤝 Đóng góp

Hoan nghênh mọi đóng góp từ cộng đồng Việt Nam và quốc tế:

- 🐛 Gửi [Issue](https://github.com/nguyenduchoai/waoowaoo/issues) báo lỗi
- 💡 Gửi [Issue](https://github.com/nguyenduchoai/waoowaoo/issues) đề xuất tính năng
- 🔧 Gửi Pull Request

---

## 📜 Nguồn gốc

Dự án này được fork từ [saturndec/waoowaoo](https://github.com/saturndec/waoowaoo) — một dự án mã nguồn mở tuyệt vời.

Phiên bản này bổ sung:
- ✅ **Việt hoá hoàn toàn** giao diện (30 file, ~2,500+ chuỗi dịch)
- ✅ Tiếng Việt là ngôn ngữ mặc định
- ✅ Hỗ trợ chuyển đổi 3 ngôn ngữ: Việt / Trung / Anh

---

**Made with ❤️ by [Hoài Nguyễn](https://github.com/nguyenduchoai) 🇻🇳**

## Star History

[![Star History Chart](https://api.star-history.com/svg?repos=nguyenduchoai/waoowaoo&type=date&legend=top-left)](https://www.star-history.com/#nguyenduchoai/waoowaoo&type=date&legend=top-left)
