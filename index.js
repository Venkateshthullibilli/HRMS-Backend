const express = require("express");
const path = require("path");
const { open } = require("sqlite");
const sqlite3 = require("sqlite3");
const jwt = require("jsonwebtoken");
const bcrypt = require("bcrypt");
const cors = require("cors");
const app = express();
app.use(cors());
app.use(express.json());
const dbPath = path.join(__dirname, "emp.db");

let db = null;

const initializeDBAndServer = async () => {
  try {
    db = await open({
      filename: dbPath,
      driver: sqlite3.Database,
    });
    app.listen(3000, () => {
      console.log("Server Running at http://localhost:3000/");
    });
  } catch (e) {
    console.log(`DB Error: ${e.message}`);
    process.exit(1);
  }
};
initializeDBAndServer();

//register

app.post("/register/", async (request, response) => {
  const { username, password, role } = request.body;
  try {
    const hashedPassword = await bcrypt.hash(request.body.password, 10);
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (dbUser === undefined) {
      const createUserQuery = `
      INSERT INTO
        users (username, password, role)
      VALUES
        (
          '${username}',
          '${hashedPassword}',
          '${role}'
        )`;
      const dbResponse = await db.run(createUserQuery);
      const newUserId = dbResponse.lastID;
      response
        .status(201)
        .json({ message: `Created new user with ${newUserId}` });
    } else {
      response.status(400).status({ error: "User already exists" });
    }
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

//login

app.post("/login/", async (request, response) => {
  const { username, password } = request.body;
  try {
    const selectUserQuery = `SELECT * FROM users WHERE username = '${username}'`;
    const dbUser = await db.get(selectUserQuery);
    if (selectUserQuery === undefined) {
      response.status(400).json({ error: "Invalid User" });
    } else {
      const comparePassword = await bcrypt.compare(password, dbUser.password);
      if (comparePassword) {
        const payload = {
          username: username,
        };
        const jwtToken = jwt.sign(payload, "MY_SECRET_TOKEN");
        response.send({ jwtToken });
      } else {
        response.status(400).json({ error: "Invalid Password" });
      }
    }
  } catch (error) {
    response.status(500).json({ error: error.message });
  }
});

// Authentication  middleware function

const authenticateToken = (request, response, next) => {
  let jwtToken;
  const authHeader = request.headers["authorization"];
  if (authHeader !== undefined) {
    jwtToken = authHeader.split(" ")[1];
  }
  if (jwtToken === undefined) {
    response.status(401).json({ error: "Invalid JWT Token" });
  } else {
    jwt.verify(jwtToken, "MY_SECRET_TOKEN", async (error, payload) => {
      if (error) {
        response.status(401).json({ error: "Invalid JWT Token" });
      } else {
        request.username = payload.username;
        next();
      }
    });
  }
};

const accessControl = (accessRoles) => {
  return async (request, response, next) => {
    if (!request.username) {
      return response.status(401).json({ error: "User not authenticated" });
    }
    const getRole = `SELECT role FROM users WHERE username =  '${request.username}'`;

    const userResponse = await db.get(getRole);

    if (!userResponse) {
      return response.status(401).json({ error: "User role is notfound" });
    }
    if (!accessRoles.includes(userResponse.role)) {
      return response.status(403).json({ error: "You don't have access" });
    }
    next();
  };
};

app.get("/employees/", authenticateToken, async (request, response) => {
  try {
    const getEmployees = `
            SELECT
                *
            FROM
            employees
        `;
    const dbResponse = await db.all(getEmployees);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(400).json({ error: "Internal server Error" });
  }
});

// get employee

app.get("/employees/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  try {
    const getEmployees = `
            SELECT
                *
            FROM
            employees
            WHERE id = ${id}
        `;
    const dbResponse = await db.all(getEmployees);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: "Internal server Error" });
  }
});

app.post(
  "/employees/",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const {
      firstName,
      lastName,
      email,
      phone,
      hireDate,
      departmentId,
      roleId,
    } = request.body;
    try {
      const addNewEmployee = `
            INSERT INTO employees(first_name,last_name,email,phone,hire_date,department_id,role_id)
            VALUES(
                '${firstName}',
                '${lastName}',
                '${email}',
                '${phone}',
                '${hireDate}',
                '${departmentId}',
                '${roleId}'
            )
    `;
      await db.run(addNewEmployee);
      response.status(201).json({ message: "User added successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// updating employee

app.put(
  "/employees/:id",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { id } = request.params;
    const {
      firstName,
      lastName,
      email,
      phone,
      hireDate,
      departmentId,
      roleId,
    } = request.body;
    try {
      const updateEmployee = `
            UPDATE
                employees
             SET
                first_name = '${firstName}',
                last_name = '${lastName}',
                email = '${email}',
                phone = '${phone}',
                hire_date = '${hireDate}',
                department_id = '${departmentId}',
                role_id = '${roleId}'
            WHERE id = '${id}'
    `;
      await db.run(updateEmployee);
      response.status(200).json({ message: "User Updated successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// deleting employee

app.delete(
  "/employees/:id",
  authenticateToken,
  accessControl(["HR Manager"]),
  async (request, response) => {
    const { id } = request.params;
    try {
      const deleteEmployee = `DELETE FROM employees WHERE id = '${id}'`;
      await db.run(deleteEmployee);
      response.status(200).json({ message: "Employee Deleted successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// get departments

app.get("/departments/", authenticateToken, async (request, response) => {
  try {
    const getDepartments = `
            SELECT
                *
            FROM
            departments
        `;
    const dbResponse = await db.all(getDepartments);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: "Internal server Error" });
  }
});

// get department

app.get("/departments/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  try {
    const getDepartments = `
            SELECT
                *
            FROM
            departments
            WHERE id = ${id}
        `;
    const dbResponse = await db.all(getDepartments);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: "Internal server Error" });
  }
});

app.post(
  "/departments/",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { name } = request.body;
    console.log(`Request Body: ${JSON.stringify(request.body)}`);
    try {
      const addDepartment = `
            INSERT INTO departments(name)
            VALUES('${name}')
    `;
      await db.run(addDepartment);
      response.status(201).json({ message: "Department added successfully!" });
    } catch (error) {
      console.log(error);
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// updating departments

app.put(
  "/departments/:id",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { id } = request.params;
    const { name } = request.body;
    try {
      const updateDepartment = `
            UPDATE
               departments
             SET
                name = '${name}'
            WHERE id = '${id}'
    `;
      await db.run(updateDepartment);
      response
        .status(200)
        .json({ message: "Department Updated successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// deleting departments

app.delete(
  "/departments/:id",
  authenticateToken,
  accessControl(["HR Manager"]),
  async (request, response) => {
    const { id } = request.params;
    try {
      const deleteEmployee = `
           DELETE FROM departments
           WHERE id = '${id}'
    `;
      await db.run(deleteEmployee);
      response
        .status(200)
        .json({ message: "Department Deleted successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// get roles

app.get("/roles/", authenticateToken, async (request, response) => {
  try {
    const getRoles = `
            SELECT
                *
            FROM
            roles
        `;
    const dbResponse = await db.all(getRoles);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: "Internal server Error" });
  }
});

// get role

app.get("/roles/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  try {
    const getRole = `
            SELECT
                *
            FROM
            roles
            WHERE id = '${id}'
        `;
    const dbResponse = await db.all(getRole);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: `Internal server Error` });
  }
});

//create role

app.post(
  "/roles/",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { title } = request.body;
    console.log(`Request Body: ${JSON.stringify(request.body)}`);
    try {
      const addRole = `
            INSERT INTO roles(title)
            VALUES('${title}')
    `;
      await db.run(addRole);
      response.status(201).json({ message: "Role added successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// updating role

app.put(
  "/roles/:id",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { id } = request.params;
    const { title } = request.body;
    try {
      const updateRole = `
            UPDATE roles
            SET title = '${title}'
            WHERE id = '${id}'
    `;
      await db.run(updateRole);
      response.status(200).json({ message: "Role Updated successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// deleting role

app.delete(
  "/roles/:id",
  authenticateToken,
  accessControl(["HR Manager"]),
  async (request, response) => {
    const { id } = request.params;
    try {
      const deleteRole = `
           DELETE FROM roles
           WHERE id = '${id}'
    `;
      await db.run(deleteRole);
      response.status(200).json({ message: "Role Deleted successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// get performance reviews

app.get("/performance/", authenticateToken, async (request, response) => {
  try {
    const getReview = `
            SELECT
                *
            FROM
            performance_reviews
        `;
    const dbResponse = await db.all(getReview);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: "Internal server Error" });
  }
});

// get performance review

app.get("/performance/:id", authenticateToken, async (request, response) => {
  const { id } = request.params;
  try {
    const getReview = `
            SELECT
                *
            FROM
            performance_reviews
            WHERE id = '${id}'
        `;
    const dbResponse = await db.all(getReview);
    response.status(200).json(dbResponse);
  } catch (error) {
    response.status(500).json({ error: `Internal server Error` });
  }
});

app.post(
  "/performance/",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { employeeId, reviewDate, rating, comments } = request.body;
    try {
      const addReview = `INSERT INTO performance_reviews(employee_id, review_date, rating, comments)
            VALUES('${employeeId}','${reviewDate}','${rating}','${comments}')`;
      await db.run(addReview);
      response.status(201).json({ message: "Review added successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// updating performance reviews

app.put(
  "/performance/:id",
  authenticateToken,
  accessControl(["HR Manager", "HR Administrator"]),
  async (request, response) => {
    const { id } = request.params;
    const { reviewDate, rating, comments } = request.body;
    try {
      const updateReview = `
            UPDATE
               performance_reviews
             SET
                review_date= '${reviewDate}',
                rating = '${rating}',
                comments = '${comments}'
            WHERE id = '${id}'
    `;
      await db.run(updateReview);
      response.status(200).json({ message: "Review Updated successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);

// deleting performance reviews

app.delete(
  "/performance/:id",
  authenticateToken,
  accessControl(["HR Manager"]),
  async (request, response) => {
    const { id } = request.params;
    try {
      const deleteReview = `
           DELETE FROM performance_reviews
           WHERE id = '${id}'
    `;
      await db.run(deleteReview);
      response.status(200).json({ message: "Review Deleted successfully!" });
    } catch (error) {
      response.status(500).json({ error: "Internal server Error" });
    }
  }
);
