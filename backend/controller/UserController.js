import User from '../models/UserModel.js'; // Import model User dari sequelize
import bcrypt from 'bcrypt';
import jwt from 'jsonwebtoken';

// Get all users
async function getUser(req, res) {
  try {
    // If userId is in the request, return just that user (profile)
    if (req.userId && !req.query.all) {
      const user = await User.findByPk(req.userId, {
        attributes: ['id', 'email', 'username', 'role', 'profilePicture', 'steamId', 'street', 'city', 'zipCode', 'country']
      });
      
      if (!user) {
        return res.status(404).json({ message: "User not found" });
      }
      
      return res.status(200).json(user);
    }
    
    // Otherwise, get all users (admin only)
    const users = await User.findAll({
      attributes: ['id', 'email', 'username', 'role', 'profilePicture'] 
    });
    res.status(200).json(users);
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ 
      status: "Error", 
      message: error.message 
    });
  }
}

// Update user profile
async function updateUserProfile(req, res) {
  try {
    const userId = req.userId;
    const { 
      username, 
      email, 
      currentPassword, 
      newPassword, 
      profilePicture, 
      steamId, 
      street, 
      city, 
      zipCode, 
      country 
    } = req.body;
    
    // Find the user
    const user = await User.findByPk(userId);
    
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    
    // Create an update object
    const updateData = {};
    
    // Handle username update
    if (username && username !== user.username) {
      // Check if username is already taken
      const existingUser = await User.findOne({ where: { username } });
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ 
          status: "Error", 
          message: "Username already taken" 
        });
      }
      updateData.username = username;
    }
    
    // Handle email update
    if (email && email !== user.email) {
      // Validate email format
      if (!/^\S+@\S+\.\S+$/.test(email)) {
        return res.status(400).json({ 
          status: "Error", 
          message: "Invalid email format" 
        });
      }
      
      // Check if email is already registered
      const existingUser = await User.findOne({ where: { email } });
      if (existingUser && existingUser.id !== userId) {
        return res.status(400).json({ 
          status: "Error", 
          message: "Email already registered" 
        });
      }
      updateData.email = email;
    }
    
    // Handle password update
    if (newPassword) {
      if (!currentPassword) {
        return res.status(400).json({ 
          status: "Error", 
          message: "Current password is required to set a new password" 
        });
      }
      
      // Verify current password
      const validPassword = await bcrypt.compare(currentPassword, user.password);
      if (!validPassword) {
        return res.status(400).json({ 
          status: "Error", 
          message: "Current password is incorrect" 
        });
      }
      
      // Validate new password strength (at least 6 characters)
      if (newPassword.length < 6) {
        return res.status(400).json({ 
          status: "Error", 
          message: "New password must be at least 6 characters long" 
        });
      }
      
      // Hash the new password
      updateData.password = await bcrypt.hash(newPassword, 10);
    }
    
    // Update profile details
    if (profilePicture) updateData.profilePicture = profilePicture;
    if (steamId) updateData.steamId = steamId;
    if (street) updateData.street = street;
    if (city) updateData.city = city;
    if (zipCode) updateData.zipCode = zipCode;
    if (country) updateData.country = country;
    
    // If no fields to update, return early
    if (Object.keys(updateData).length === 0) {
      return res.status(400).json({
        status: "Error",
        message: "No valid fields provided for update"
      });
    }
    
    // Update user fields
    const updatedUser = await user.update(updateData);
    
    // Return updated user without sensitive information
    const { password: _, refresh_token: __, ...safeUserData } = updatedUser.toJSON();
    
    res.status(200).json({
      status: "Success",
      message: "Profile updated successfully",
      data: safeUserData
    });
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ 
      status: "Error", 
      message: error.message 
    });
  }
}

// Register new user
async function register(req, res) {
  try {
    const { email, username, password, role = 'customer' } = req.body;
    
    // Check if user with this email already exists
    const existingUser = await User.findOne({
      where: {
        email: email
      }
    });
    
    if (existingUser) {
      return res.status(400).json({ 
        status: "Error", 
        message: "Email already registered" 
      });
    }
    
    // Hash the password
    const encryptPassword = await bcrypt.hash(password, 5);
    
    // Create new user
    const newUser = await User.create({
      email,
      username,
      password: encryptPassword,
      role,
      refresh_token: null
    });
    
    // Return success but don't include password in response
    const { password: _, ...userWithoutPassword } = newUser.toJSON();
    
    res.status(201).json({
      status: "Success",
      message: "Registration successful",
      data: userWithoutPassword
    });
    
  } catch (error) {
    console.log(error.message);
    res.status(500).json({ 
      status: "Error", 
      message: error.message 
    });
  }
}

async function login(req, res) {
    try {
      const { email, password } = req.body;
  
      const user = await User.findOne({
        where: {
          email: email,
        },
      });
  
      if (user) {
        const userPlain = user.toJSON();
  
        // Exclude sensitive information from user data sent to frontend
        const { password: _, refresh_token: __, ...safeUserData } = userPlain;
  
        const decryptPassword = await bcrypt.compare(password, user.password);
  
        if (decryptPassword) {
          const accessToken = jwt.sign(
            safeUserData,
            process.env.ACCESS_TOKEN_SECRET,
            {
              expiresIn: "30m",
            }
          );
  
          const refreshToken = jwt.sign(
            safeUserData,
            process.env.REFRESH_TOKEN_SECRET,
            {
              expiresIn: "1d",
            }
          );
  
          await User.update(
            { refresh_token: refreshToken },
            {
              where: {
                id: user.id,
              },
            }
          );
  
          res.cookie("refreshToken", refreshToken, {
            httpOnly: false,
            sameSite: "none",
            maxAge: 24 * 60 * 60 * 1000,
            secure: true,
          });
  
          res.status(200).json({
            status: "Success",
            message: "Login Successful",
            safeUserData,
            accessToken,
          });
        } else {
          const error = new Error("Password or email incorrect");
          error.statusCode = 400;
          throw error;
        }
      } else {
        const error = new Error("Password or email incorrect");
        error.statusCode = 400;
        throw error;
      }
    } catch (error) {
      res.status(error.statusCode || 500).json({
        status: "Error",
        message: error.message,
      });
    }
}
  
async function logout(req, res) {
  const refreshToken = req.cookies.refreshToken;

  if (!refreshToken) return res.sendStatus(204);

  const user = await User.findOne({
    where: {
      refresh_token: refreshToken,
    },
  });

  if (!user) return res.sendStatus(204);

  const userId = user.id;

  await User.update(
    { refresh_token: null },
    {
      where: {
        id: userId,
      },
    }
  );

  res.clearCookie("refreshToken");
  return res.sendStatus(200);
}

export { login, logout, getUser, register, updateUserProfile };