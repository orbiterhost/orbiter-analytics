import { PinataSDK } from "pinata";
import fs from "fs";
import dotenv from "dotenv";
dotenv.config();

const pinata = new PinataSDK({
  pinataJwt: process.env.PINATA_JWT,
  pinataGateway: "",
});

export const backupDatabase = async () => {
    try {
        const blob = new Blob([fs.readFileSync("./traffic.db")]);
        const file = new File([blob], `orbiter-analytics-db-${new Date()}`, { type: "text/plain"})
        const upload = await pinata.upload.file(file);
        console.log(upload);
    } catch (error) {
        console.log("DB backup failed");
        console.log(error);
    }
}
