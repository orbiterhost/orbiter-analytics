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
	console.log("backing up db");
        const blob = new Blob([fs.readFileSync("./traffic.db")]);
        const file = new File([blob], `orbiter-analytics-db-${new Date()}`, { type: "text/plain"})
        const upload = await pinata.upload.file(file).group("019501f1-c849-74df-aa3e-d92218097fef");
        console.log(upload);
    } catch (error) {
        console.log("DB backup failed");
        console.log(error);
    }
}
