import express from "express";
import cors from "cors";
import admin, { messaging } from "firebase-admin";
import { createRequire } from "module";
const require = createRequire(import.meta.url);

const serviceAccount = require("./serviceAccountKey.json");

const app = express();
app.use(cors());
app.use(express.json());

admin.initializeApp({
    credential: admin.credential.cert(serviceAccount)
})

const db = admin.firestore();

const pendingRequest = [];

// Example endpoint to receive delete requests
app.post("/delete-account", async (req, res) => {
    const { email, password } = req.body;
    console.log("Delete request received for:", email);

    const exists = pendingRequest.some(item => item.email === email);
    if(exists){
        return res.status(400).json({message: "A deletion request for this email is already pending."})
    }
    const result = await verifyUser(email, password);
    console.log("isverified: ", result.verified, "\nreason: ", result.reason);

    if(!result.verified){
        return res.status(400).json({message: result.reason})
    }

    const data = {email, password, timestamp: new Date().toISOString()};
    pendingRequest.push(data);
    res.status(200).json({message: "Request received and stored. ", received: data});
});

app.get("/get-request", (req, res) => {
    const apiKey = req.header["x-api-key"];
    console.log("Admin connected to server");
    
    if(apiKey !== process.env.ADMIN_KEY){
        return res.status(403).json({ message: "Forbidden" });
    }
    res.status(200).json({
        message: "Pending requests",
        data: pendingRequest, // array of all pending requests
    });
});

// Example endpoint to receive delete requests
app.post("/confirm-delete", async (req, res) => {
    const { email, password } = req.body;
    console.log("Delete request received for:", email, password);

    const index = pendingRequest.findIndex(data => data.email === email);

    if(index == -1){
        return res.status(404).json({ message: "User not found"});
    }

    const confirmedRequest = pendingRequest.splice(index, 1)[0];
    console.log("Confirmed deletion for:", confirmedRequest.email);

    const deleted = await deleteUser(confirmedRequest.email);

    if(!deleted){
        res.status(403).json({message: "Unable to delete user"});
    }

    // For now, just send a response back to confirm it works
    res.status(200).json({
        message: "User Deleted: ",
        received: {email},
    });
});

async function verifyUser(email, password){
    try{
        const userRecord = await admin.auth().getUserByEmail(email);
        
        const userDoc = await db.collection("Users").doc(userRecord.uid).get();
        if(!userDoc.exists){
            return {verified: false, reason: "User Record not found in database"};
        }


        const storedPassword = userDoc.data()['Password'];
        if(!storedPassword){
            return {verified: false, reason: "Password not saved in firebase"};
        }

        if(storedPassword === password){
            return {verified: true, reason: "User verification successful"};
        }else{
            return {verified: false, reason: "Password didn't match"};
        }
    }catch(e){
        return {verified: false, reason: e};
    }
}

async function deleteUser(email){
    try{
        const userRecord = await admin.auth().getUserByEmail(email);
        const uid = userRecord.uid;
        console.log("Deleting user id: ", uid);

        await admin.auth().deleteUser(uid);
        console.log("Deleted user: ", email);

        const userDocRef = db.collection("Users").doc(uid);
        await userDocRef.delete();
        console.log("Deleted data");
        return true;
    }catch(e){
        console.log(e);
        return false;
    }
}

// Render automatically provides a PORT environment variable
const PORT = process.env.PORT || 3000;

// Start the server
app.listen(PORT, () => console.log(`✅ Server running on port ${PORT}`));
