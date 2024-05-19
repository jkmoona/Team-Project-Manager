CREATE TABLE users (
    id INT AUTO_INCREMENT PRIMARY KEY,
    username VARCHAR(255) NOT NULL,
    password VARCHAR(255) NOT NULL
);

CREATE TABLE projects (
    `key` VARCHAR(255) PRIMARY KEY,
    name VARCHAR(255) NOT NULL,
    owner_id INT,
    FOREIGN KEY (owner_id) REFERENCES users(id)
);

CREATE TABLE project_members (
    user_id INT,
    project_key VARCHAR(255),
    FOREIGN KEY (user_id) REFERENCES users(id),
    FOREIGN KEY (project_key) REFERENCES projects(`key`),
    PRIMARY KEY (user_id, project_key)
);