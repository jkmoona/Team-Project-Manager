const socket = io("http://localhost:3000");

let currentUser = {
    id: null,
    username: null,
    projects: [],
};

let currentProjectKey = null;

function showLogin() {
    document.getElementById("login-container").classList.remove("hidden");
    document.getElementById("register-container").classList.add("hidden");
}

function showRegister() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("register-container").classList.remove("hidden");
}

function showProjects() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("register-container").classList.add("hidden");
    document.getElementById("projects-container").classList.remove("hidden");
    document.getElementById("chat-container").classList.add("hidden");

    const projectList = document.getElementById("project-list");
    projectList.innerHTML = "";
    currentUser.projects.forEach((project) => {
        const li = document.createElement("li");
        li.textContent = `${project.name}`;
        if (currentUser.id == project.owner_id) {
            li.textContent += ` (Key: ${project.key})`;
        }
        li.onclick = () => {
            currentProjectKey = project.key;
            joinProject(false);
        };
        projectList.appendChild(li);
    });
}

function showProjectChat() {
    document.getElementById("login-container").classList.add("hidden");
    document.getElementById("register-container").classList.add("hidden");
    document.getElementById("projects-container").classList.add("hidden");
    document.getElementById("chat-container").classList.remove("hidden");
}

function login() {
    const username = document.getElementById("login-username").value;
    const password = document.getElementById("login-password").value;
    socket.emit("login", { username, password });
}

function register() {
    const username = document.getElementById("register-username").value;
    const password = document.getElementById("register-password").value;
    socket.emit("register", { username, password });
}

function createProject() {
    const projectName = document.getElementById("project-name").value;
    const ownerId = currentUser.id;
    socket.emit("createProject", { projectName, ownerId });
}

function joinProject(isNewProject) {
    const key = isNewProject
        ? document.getElementById("project-key-input").value
        : currentProjectKey;

    socket.emit("join", {
        key: key,
        userId: currentUser.id,
    });
}

// Send message
function sendMessage() {
    const message = document.getElementById("message-input").value;
    if (message && currentProjectKey) {
        socket.emit("message", {
            key: currentProjectKey,
            username: currentUser.username,
            message,
        });
        document.getElementById("message-input").value = "";
    }
}

// Send a file
function sendFile() {
    const fileInput = document.getElementById("file-input");
    const file = fileInput.files[0];
    if (file) {
        const reader = new FileReader();
        reader.onload = function (event) {
            const fileBuffer = event.target.result;
            socket.emit("fileUpload", {
                key: currentProjectKey,
                username: currentUser.username,
                fileName: file.name,
                fileBuffer,
            });
        };
        reader.readAsArrayBuffer(file);
        fileInput.value = "";
    }
}

// Clear chat messages
function clearChat() {
    const projectChat = document.getElementById("project-chat");
    projectChat.innerHTML = "";
}


// Listen for events
socket.on("auth", (data) => {
    if (data.success) {
        currentUser.id = data.userId; // Store the logged-in user data
        currentUser.username = data.username;
        currentUser.projects = data.projects;
        showProjects();
    } else {
        alert(data.message);
    }
});

socket.on("register", (data) => {
    if (data.success) {
        alert(data.message);
        showLogin();
    } else {
        alert(data.message);
    }
});

socket.on("projectCreated", (data) => {
    if (data.success) {
        document.getElementById("project-key").classList.remove("hidden");
        document.getElementById("project-key-value").innerText = data.key;

        const newProject = {
            name: data.name,
            key: data.key,
        };

        currentUser.projects.push(newProject);
        showProjects();
        document.getElementById("project-name").innerText = "";
    } else {
        alert(data.message);
    }
});

socket.on("joinResult", (data) => {
    if (data.success) {
        currentProjectKey = data.key;
        showProjectChat();

        document.getElementById("project-key-field").innerText = "";
        if (data.isOwner) {
            document.getElementById(
                "project-key-field"
            ).innerText = `Project Key: ${data.key}`;
        }
        clearChat();
    } else {
        alert(data.message);
    }
});

socket.on("onlineUsers", (onlineUsers) => {
    document.getElementById("online-users-list").innerText =
        onlineUsers.join(", ");
});

socket.on("message", (data) => {
    if (data.key === currentProjectKey) {
        const projectChat = document.getElementById("project-chat");
        const messageElement = document.createElement("div");
        messageElement.innerText = `${data.username}: ${data.message}`;
        projectChat.appendChild(messageElement);
        projectChat.scrollTop = projectChat.scrollHeight;
    }
});

socket.on("file", (data) => {
    const projectChat = document.getElementById("project-chat");
    const fileElement = document.createElement("div");
    const fileUrl = `${window.location.origin}/uploads/${data.fileName}`;
    fileElement.innerHTML = `${data.username}: <a href="${fileUrl}" target="_blank" download>${data.fileName}</a>`;
    projectChat.appendChild(fileElement);
});

socket.on("userJoined", (data) => {
    if (data.key === currentProjectKey) {
        const chat = document.getElementById("project-chat");
        const messageElement = document.createElement("div");
        messageElement.innerText = `User ${data.userId} joined the chat.`;
        chat.appendChild(messageElement);
    }
});

socket.on("userLeft", (data) => {
    if (data.key === currentProjectKey) {
        const chat = document.getElementById("project-chat");
        const messageElement = document.createElement("div");
        messageElement.innerText = `User ${data.userId} left the chat.`;
        chat.appendChild(messageElement);
    }
});

document
    .getElementById("message-input")
    .addEventListener("keydown", function (event) {
        if (event.key === "Enter") {
            sendMessage();
        }
    });
