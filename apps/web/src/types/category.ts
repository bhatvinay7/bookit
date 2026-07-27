export interface Category {
  id: string; // Hex string from MongoDB
  name: string;
  slug: string;
  description?: string;
  image_url?: string;
  created_at?: string;
  updated_at?: string;
}
