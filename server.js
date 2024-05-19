const http = require("http");
const socketIO = require("socket.io")
const express = require('express');
const mysql = require("mysql");
const fs = require('fs');
const path = require('path');

const app = express();
const server = http.createServer(app);
const io = socketIO(server, { cors: { origin: '*' }} );

// Create database connection
const db = mysql.createConnection({
    host: "localhost",
    user: "root",
    password: "shzsay!",
    database: "network-app-db",
});

db.connect((err) => {
    if (err) throw err;
    console.log("MySQL Connected...");
});

// Store connected clients and their projects
const onlineUsers = {};
const fileStorageDir = path.join(__dirname, 'uploads');

// Ensure the file storage directory exists
if (!fs.existsSync(fileStorageDir)) {
  fs.mkdirSync(fileStorageDir);
}

app.use('/uploads', express.static(fileStorageDir));
app.use(express.static(path.join(__dirname, 'public')));

// Socket.IO connection
io.on("connection", (socket) => {
    let currentProject = null;

    // console.log("New client connected");

    socket.on("login", (credentials) => {
        authenticateUser(credentials, socket);
    });

    socket.on("register", (userData) => {
        registerUser(userData, socket);
    });

    socket.on("createProject", (projectData) => {
        createProject(projectData, socket);
    });

    socket.on("join", (joinData) => {
        const { key, userId } = joinData;
        joinProjectSocket(key, userId, socket);

        // if (!onlineUsers[projectKey]) {
        //     onlineUsers[projectKey] = {};
        //   }
      
        //   onlineUsers[projectKey][userId] = username;
        //   socket.join(projectKey);
      
        //   io.to(projectKey).emit('updateUsers', Object.values(onlineUsers[projectKey]));
        
    });

    socket.on('leaveProject', (data) => {
        const { projectKey, userId } = data;
    
        if (onlineUsers[projectKey]) {
          delete onlineUsers[projectKey][userId];
          if (Object.keys(onlineUsers[projectKey]).length === 0) {
            delete onlineUsers[projectKey];
          } else {
            io.to(projectKey).emit('updateUsers', Object.values(onlineUsers[projectKey]));
          }
        }
    
        socket.leave(projectKey);
    });

    socket.on("message", (data) => {
        const { key, username, message } = data;
        // Broadcast the message to all clients in the project room
        io.to(key).emit("message", { key, username, message });
    });

    socket.on("fileUpload", (data) => {
        const { key, username, fileName, fileBuffer } = data;
        const filePath = path.join(fileStorageDir, fileName);
        fs.writeFile(filePath, fileBuffer, (err) => {
            if (err) {
                console.error("Error saving file:", err);
                socket.emit("fileUploadResult", {
                    success: false,
                    message: "File upload failed",
                });
                return;
            }
            io.to(key).emit("file", { username, fileName });
        });
    });

    socket.on("disconnect", () => {
        // console.log("Client disconnected");
    });
});

function authenticateUser(credentials, socket) {
    const { username, password } = credentials;
    const query = "SELECT * FROM users WHERE username = ? AND password = ?";
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error("Error during authentication:", err);
            socket.emit("auth", { success: false, message: "Database error" });
        } else {
            if (results.length > 0) {
                const user = results[0];
                fetchUserProjects(user.id, (projects) => {
                    socket.emit("auth", {
                        success: true,
                        message: "Authentication successful",
                        userId: user.id,
                        username: user.username,
                        projects,
                    });
                });
            } else {
                socket.emit("auth", {
                    success: false,
                    message: "Invalid username or password",
                });
            }
        }
    });
}

function fetchUserProjects(userId, callback) {
    const query = `
      SELECT projects.key, projects.name, projects.owner_id, project_members.user_id
      FROM projects
      JOIN project_members ON projects.key = project_members.project_key
      WHERE project_members.user_id = ?;
    `;
    db.query(query, [userId], (err, results) => {
        if (err) {
            console.error("Error fetching user projects:", err);
            callback([]);
        } else {
            callback(results);
        }
    });
}

function registerUser(userData, socket) {
    const { username, password } = userData;
    const query = "INSERT INTO users (username, password) VALUES (?, ?)";
    db.query(query, [username, password], (err, results) => {
        if (err) {
            console.error("Error during registration:", err);
            socket.emit("register", {
                success: false,
                message: "Registration failed",
            });
        } else {
            socket.emit("register", {
                success: true,
                message: "Registration successful",
            });
        }
    });
}

function createProject(projectData, socket) {
    const { projectName, ownerId } = projectData;
    const projectKey = generateSimpleKey();
    const query =
        "INSERT INTO projects (name, `key`, owner_id) VALUES (?, ?, ?)";
    db.query(query, [projectName, projectKey, ownerId], (err, results) => {
        if (err) {
            console.error("Error during project creation:", err);
            socket.emit("projectCreated", {
                success: false,
                message: "Failed to create project",
            });
        } else {
            // Add the owner to the project_members table
            const memberQuery =
                "INSERT INTO project_members (user_id, project_key) VALUES (?, ?)";
            db.query(
                memberQuery,
                [ownerId, projectKey],
                (err, memberResults) => {
                    if (err) {
                        console.error(
                            "Error adding owner to project members:",
                            err
                        );
                        socket.emit("projectCreated", {
                            success: false,
                            message: "Failed to add owner to project members",
                        });
                    } else {
                        socket.emit("projectCreated", {
                            success: true,
                            message: "Project created successfully",
                            key: projectKey,
                            name: projectName,
                        });
                    }
                }
            );
        }
    });
}

// Handle joining a project room
function joinProjectSocket(projectKey, userId, socket) {
    // Check if the project exists
    const projectQuery = "SELECT * FROM projects WHERE `key` = ?";
    db.query(projectQuery, [projectKey], (err, projectResults) => {
        if (err) {
            console.error("Error finding project:", err);
            socket.emit("joinResult", {
                success: false,
                message: "Error finding project",
            });
            return;
        }

        if (projectResults.length === 0) {
            socket.emit("joinResult", {
                success: false,
                message: "Project not found",
            });
            return;
        }

        const projectKey = projectResults[0].key;

        // Check if the user is already a member
        const memberQuery =
            "SELECT * FROM project_members WHERE user_id = ? AND project_key = ?";
        db.query(memberQuery, [userId, projectKey], (err, memberResults) => {
            if (err) {
                console.error("Error checking project membership:", err);
                socket.emit("joinResult", {
                    success: false,
                    message: "Error checking project membership",
                });
                return;
            }

            if (memberResults.length === 0) {
                // User is not a member, add them
                const addMemberQuery =
                    "INSERT INTO project_members (project_key, user_id) VALUES (?, ?)";
                db.query(
                    addMemberQuery,
                    [projectKey, userId],
                    (err, addMemberResults) => {
                        if (err) {
                            console.error(
                                "Error adding member to project:",
                                err
                            );
                            socket.emit("joinResult", {
                                success: false,
                                message: "Error adding member to project",
                            });
                            return;
                        }

                        socket.join(projectKey);
                        socket.emit("joinResult", {
                            success: true,
                            message: "Joined project successfully",
                            key: projectKey,
                        });
                    }
                );
            } else {
                // User is already a member, join the project room
                socket.join(projectKey);

                // Check if the user is the project owner
                const ownerQuery =
                    "SELECT `key` FROM projects WHERE `key` = ? AND owner_id = ?";
                db.query(
                    ownerQuery,
                    [projectKey, userId],
                    (err, ownerResults) => {
                        if (err) {
                            console.error(
                                "Error checking project ownership:",
                                err
                            );
                            socket.emit("joinResult", {
                                success: false,
                                message: "Error checking project ownership",
                            });
                            return;
                        }

                        const isOwner = ownerResults.length > 0;
                        socket.emit("joinResult", {
                            success: true,
                            message: "Joined project successfully",
                            key: projectKey,
                            isOwner: isOwner,
                        });
                    }
                );
            }
        });
    });
}

function generateSimpleKey() {
    return Math.random().toString(36).substr(2, 8); // Generate a simple 8-character key
}

const PORT = process.env.PORT || 3000;


server.listen(PORT, () => {
    console.log("Server listening on port 3000");
});
