# CloudBox ☁️📦

![License: MIT](https://img.shields.io/badge/License-MIT-yellow.svg)
![TypeScript](https://img.shields.io/badge/TypeScript-007ACC?style=flat-logo=typescript&logoColor=white)
![React](https://img.shields.io/badge/React-20232A?style=flat&logo=react&logoColor=61DAFB)
![Node.js](https://img.shields.io/badge/Node.js-43853D?style=flat&logo=node.js&logoColor=white)

**CloudBox** is a powerful, self-hosted cloud storage solution designed to provide a secure and user-friendly alternative to commercial services like Google Drive or Dropbox. Built with performance and privacy in mind, it offers a complete suite of tools for file management, media streaming, and collaboration.

---

## ✨ Features

### 📂 Advanced File Management

- **Chunked Uploads**: Seamlessly upload files of any size with automatic resume capability.
- **Folder Organization**: Create unlimited nested folders to keep your data structured.
- **Drag & Drop**: Intuitive drag-and-drop interface for files and folders.
- **Context Menus**: Right-click actions for quick access to renaming, moving, and deleting.

### 🎬 Media Streaming & Preview

- **Video Player**: Stream video files directly in the browser with adaptive transcoding.
- **Photo Gallery**: Browse photos with a beautiful masonry grid and lightbox viewer.
- **Music Player**: Global music player that continues playing as you navigate the app.
- **PDF Viewer**: Preview authorized documents without downloading.

### 🤝 Sharing & Collaboration

- **Public Links**: Generate secure sharing links for anyone to access.
- **Password Protection**: Secure your shared links with custom passwords.
- **Expiration Dates**: Set automatic expiration for sensitive shares.
- **Download Limits**: Control the number of times a file can be downloaded.

### 🛡️ Security & Administration

- **User Management**: Full admin dashboard to manage users, roles, and quotas.
- **Storage Quotas**: Define generic or per-user storage limits.
- **Rate Limiting**: Built-in protection against abuse.
- **Secure Auth**: JWT-based stateless authentication with refresh token rotation.

---

## 🛠️ Technology Stack

We use a modern, strictly-typed stack to ensure reliability and ease of maintenance.

### Frontend

- **Framework**: [React 18](https://reactjs.org/) (via [Vite](https://vitejs.dev/))
- **State Management**: [Zustand](https://github.com/pmndrs/zustand)
- **Styling**: [Tailwind CSS](https://tailwindcss.com/)
- **Routing**: React Router DOM v6
- **Data Fetching**: TanStack Query

### Backend

- **Runtime**: [Node.js](https://nodejs.org/)
- **Framework**: [Express.js](https://expressjs.com/)
- **Language**: TypeScript
- **Database**: PostgreSQL (via [Prisma ORM](https://www.prisma.io/))
- **Background Jobs**: Redis + Bull

---

## 📚 Documentation

Detailed documentation is available in the `docs/` directory to help you get started and understand the system architecture.

- [**📥 Getting Started**](./docs/getting_started.md): Installation, environment setup, and running the app locally.
- [**🏗️ Architecture**](./docs/architecture.md): Deep dive into the system design, components, and security.
- [**🔌 API Overview**](./docs/api_overview.md): Reference for the REST API endpoints.
- [**🗄️ Database Schema**](./docs/database_schema.md): Explanation of the data models.
- [**🎨 Frontend Guide**](./docs/frontend_guide.md): Guide for frontend development and structure.

---

## ⚡ Quick Start

1. **Clone the repository**

    ```bash
    git clone https://github.com/yourusername/cloudbox.git
    cd cloudbox
    ```

2. **Install Dependencies**

    ```bash
    npm run install:all
    ```

3. **Setup Environment**
    Copy the `.env.example` files in both `backend/` and `frontend/` to `.env` and fill in your database and Redis credentials.

4. **Initialize Database**

    ```bash
    npm run setup
    ```

5. **Run Development Servers**

    ```bash
    npm run dev
    ```

    - Frontend: `http://localhost:5173`
    - Backend: `http://localhost:3001`

---

## 📄 License

This project is licensed under the **MIT License**. See the [LICENSE](LICENSE) file for details.

Permission is hereby granted, free of charge, to any person obtaining a copy of this software and associated documentation files (the "Software"), to deal in the Software without restriction, including without limitation the rights to use, copy, modify, merge, publish, distribute, sublicense, and/or sell copies of the Software, and to permit persons to whom the Software is furnished to do so, subject to the following conditions:

The above copyright notice and this permission notice shall be included in all copies or substantial portions of the Software.

THE SOFTWARE IS PROVIDED "AS IS", WITHOUT WARRANTY OF ANY KIND, EXPRESS OR IMPLIED, INCLUDING BUT NOT LIMITED TO THE WARRANTIES OF MERCHANTABILITY, FITNESS FOR A PARTICULAR PURPOSE AND NONINFRINGEMENT. IN NO EVENT SHALL THE AUTHORS OR COPYRIGHT HOLDERS BE LIABLE FOR ANY CLAIM, DAMAGES OR OTHER LIABILITY, WHETHER IN AN ACTION OF CONTRACT, TORT OR OTHERWISE, ARISING FROM, OUT OF OR IN CONNECTION WITH THE SOFTWARE OR THE USE OR OTHER DEALINGS IN THE SOFTWARE.
