# Mathedemic

A project setup guide for running the Mathedemic application.

## 🚀 Getting Started

### 1. Install Dependencies

``` bash
npm install
```

### 2. Start MongoDB

Open a new terminal and start the MongoDB shell:

``` bash
mongosh
use mathedemic
```

This will create (or switch to) the `mathedemic` database.

### 3. Expose Local Server

Open another terminal and run LocalTunnel to expose your server:

``` bash
npx localtunnel --port 5001 --subdomain big-bears-smoke
```

### 4. Start the Application

Finally, in your project's terminal, start the application:

``` bash
npm start
```

## 📌 Notes

-   Ensure MongoDB is running locally before starting the app.\
-   LocalTunnel creates a temporary public URL so your app can be
    accessed externally.\
-   You can replace the subdomain (`big-bears-smoke`) with your own if
    needed.
