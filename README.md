# 🚀 YDrive - Internal File Storage System

<div align="center">

**On-Premises Google Drive Clone untuk Internal Use**

[![NestJS](https://img.shields.io/badge/NestJS-10.x-red?style=flat-square&logo=nestjs)](https://nestjs.com/)
[![Next.js](https://img.shields.io/badge/Next.js-14.x-black?style=flat-square&logo=next.js)](https://nextjs.org/)
[![TypeScript](https://img.shields.io/badge/TypeScript-5.x-blue?style=flat-square&logo=typescript)](https://www.typescriptlang.org/)
[![Docker](https://img.shields.io/badge/Docker-Ready-2496ED?style=flat-square&logo=docker)](https://www.docker.com/)
[![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg?style=flat-square)](https://opensource.org/licenses/MIT)

</div>

---

## 📋 Deskripsi

**YDrive** adalah sistem penyimpanan file internal berbasis web yang dirancang untuk menggantikan solusi cloud storage eksternal dengan solusi on-premises yang aman dan terkontrol. Terinspirasi dari Google Drive, YDrive menyediakan antarmuka modern dan intuitif untuk mengelola file dan folder.

### ✨ Fitur Utama

| Fitur | Deskripsi |
|-------|-----------|
| 📁 **File & Folder Management** | Upload, download, rename, move, delete file dan folder |
| 👁️ **File Preview** | Preview gambar, PDF, video, Office documents dalam browser |
| 🔗 **File Sharing** | Buat link berbagi dengan permission control |
| 📦 **Archive Preview** | Lihat isi file ZIP dan RAR tanpa extract |
| ⭐ **Starred Files** | Tandai file favorit untuk akses cepat |
| 🗑️ **Trash & Restore** | Soft delete dengan opsi restore |
| 🔍 **Advanced Search** | Filter berdasarkan type, date, size, dengan sorting |
| 📜 **Version History** | Lihat dan restore versi file sebelumnya |
| 📊 **Storage Quota** | Monitoring penggunaan storage per user |
| 👥 **User Management** | Admin panel untuk kelola user |
| 🎨 **Modern UI** | Interface responsive dengan grid/list view |

---

## 🛠️ Tech Stack

### Backend
- **Framework:** NestJS 10.x
- **Language:** TypeScript 5.x
- **Database:** PostgreSQL 15
- **Object Storage:** MinIO (S3-compatible)
- **Queue:** BullMQ + Redis
- **Authentication:** JWT (Access + Refresh Token)
- **ORM:** TypeORM
- **File Processing:** Sharp (thumbnails), LibreOffice (Office preview)

### Frontend
- **Framework:** Next.js 14 (App Router)
- **Language:** TypeScript 5.x
- **Styling:** Tailwind CSS
- **UI Components:** Shadcn/UI + Lucide Icons
- **State Management:** Zustand
- **HTTP Client:** Axios
- **Notifications:** Sonner

### Infrastructure
- **Containerization:** Docker + Docker Compose
- **Reverse Proxy:** (Optional) Nginx / Traefik

---

## 📦 Requirements

### System Requirements
- **OS:** Windows 10/11, Ubuntu 20.04+, macOS 12+
- **RAM:** Minimum 4GB (8GB recommended)
- **Storage:** Minimum 10GB free space
- **Docker:** 20.10+ with Docker Compose V2

### Software Dependencies
| Software | Version | Required |
|----------|---------|----------|
| Docker Desktop | 4.x+ | ✅ |
| Node.js | 18.x+ | Optional (dev only) |
| Git | 2.x+ | ✅ |

---

## 🚀 Installation

### Quick Start (Docker)

1. **Clone repository**
   ```bash
   git clone https://github.com/Avzls/YDrive.git
   cd YDrive/file-storage
   ```

2. **Copy environment file**
   ```bash
   cp .env.example .env
   ```

3. **Start all services**
   ```bash
   docker-compose up -d --build
   ```

4. **Wait for services to be ready** (1-2 minutes)
   ```bash
   docker-compose logs -f api
   ```

5. **Access the application**
   - 🌐 **Frontend:** http://localhost:3001
   - 🔧 **API:** http://localhost:3000/api/v1
   - 📚 **Swagger Docs:** http://localhost:3000/api/docs
   - 💾 **MinIO Console:** http://localhost:9001

### Development Setup

1. **Start infrastructure only**
   ```bash
   docker-compose up -d postgres redis minio
   ```

2. **Install dependencies**
   ```bash
   # Backend
   npm install

   # Frontend
   cd frontend && npm install
   ```

3. **Run migrations**
   ```bash
   npm run migration:run
   ```

4. **Start development servers**
   ```bash
   # Terminal 1: Backend API
   npm run start:dev

   # Terminal 2: Backend Worker
   npm run start:worker

   # Terminal 3: Frontend
   cd frontend && npm run dev
   ```

---

## 🔐 Default Credentials

### Application Login
| NIP | Password | Role |
|-----|----------|------|
| `admin` | `admin123` | Admin |
| `user1` | `user123` | User |

### Infrastructure Services

| Service | URL | Username | Password |
|---------|-----|----------|----------|
| PostgreSQL | `localhost:5432` | `postgres` | `postgres` |
| MinIO Console | `localhost:9001` | `minioadmin` | `minioadmin` |
| Redis | `localhost:6379` | - | - |

> ⚠️ **Security Notice:** Change all default passwords sebelum deploy ke production!

---

## 📁 Project Structure

```
file-storage/
├── src/                    # Backend source code
│   ├── modules/           # Feature modules
│   │   ├── auth/          # Authentication
│   │   ├── files/         # File management
│   │   ├── folders/       # Folder management
│   │   ├── permissions/   # Sharing & permissions
│   │   ├── storage/       # MinIO integration
│   │   └── users/         # User management
│   ├── common/            # Shared utilities
│   ├── database/          # Migrations
│   └── jobs/              # Background workers
│
├── frontend/              # Frontend source code
│   ├── src/
│   │   ├── app/           # Next.js app router
│   │   ├── components/    # React components
│   │   └── lib/           # Utilities & API client
│   └── public/            # Static assets
│
├── docker-compose.yml     # Docker services
├── Dockerfile            # API container
└── .env.example          # Environment template
```

---

## 🔧 Environment Variables

```env
# Database
DATABASE_HOST=postgres
DATABASE_PORT=5432
DATABASE_NAME=filestorage
DATABASE_USER=postgres
DATABASE_PASSWORD=postgres

# Redis
REDIS_HOST=redis
REDIS_PORT=6379

# MinIO
MINIO_ENDPOINT=minio
MINIO_PORT=9000
MINIO_ACCESS_KEY=minioadmin
MINIO_SECRET_KEY=minioadmin

# JWT
JWT_SECRET=your-super-secret-jwt-key
JWT_REFRESH_SECRET=your-refresh-secret-key

# Frontend
NEXT_PUBLIC_API_URL=http://localhost:3000/api/v1
```

---

## 📖 API Documentation

API documentation tersedia melalui Swagger UI:

- **Local:** http://localhost:3000/api/docs
- **Format:** OpenAPI 3.0

### Key Endpoints

| Method | Endpoint | Description |
|--------|----------|-------------|
| `POST` | `/auth/login` | Login user |
| `GET` | `/files` | List files in folder |
| `POST` | `/files/upload` | Upload file |
| `GET` | `/files/:id/stream` | Download file |
| `POST` | `/files/:id/version` | Upload new version |
| `GET` | `/files/:id/versions` | Get version history |
| `GET` | `/folders` | List folders |
| `POST` | `/folders` | Create folder |

---

## 🐳 Docker Commands

```bash
# Start all services
docker-compose up -d

# Rebuild and start
docker-compose up -d --build

# View logs
docker-compose logs -f [service-name]

# Stop all services
docker-compose down

# Reset everything (including data)
docker-compose down -v
```

---

## 🧪 Testing

```bash
# Unit tests
npm run test

# E2E tests
npm run test:e2e

# Test coverage
npm run test:cov
```

---

## 🤝 Contributing

1. Fork the repository
2. Create feature branch (`git checkout -b feature/amazing-feature`)
3. Commit changes (`git commit -m 'Add amazing feature'`)
4. Push to branch (`git push origin feature/amazing-feature`)
5. Open Pull Request

---

## 📄 License

This project is licensed under the **MIT License** - see the [LICENSE](LICENSE) file for details.

```
MIT License

Copyright (c) 2024 TESLA Team

Permission is hereby granted, free of charge, to any person obtaining a copy
of this software and associated documentation files (the "Software"), to deal
in the Software without restriction, including without limitation the rights
to use, copy, modify, merge, publish, distribute, sublicense, and/or sell
copies of the Software, and to permit persons to whom the Software is
furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all
copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR
IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY,
FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE
AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER
LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM,
OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE
SOFTWARE.
```

---

<div align="center">

Made with ❤️ by **TESLA Team**

</div>
