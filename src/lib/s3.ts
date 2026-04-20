import { S3Client } from "@aws-sdk/client-s3";

const SPACES_ENDPOINT = process.env.SPACES_ENDPOINT || "https://nyc3.digitaloceanspaces.com";
const SPACES_KEY = process.env.SPACES_KEY;
const SPACES_SECRET = process.env.SPACES_SECRET;

if (!SPACES_KEY || !SPACES_SECRET) {
  console.warn("SPACES_KEY or SPACES_SECRET is missing. File uploads will fail.");
}

export const s3Client = new S3Client({
  endpoint: SPACES_ENDPOINT,
  region: "nyc3", // Region must match your endpoint
  credentials: {
    accessKeyId: SPACES_KEY!,
    secretAccessKey: SPACES_SECRET!,
  },
  forcePathStyle: false, // DO Spaces works best with false (virtual host style)
});
