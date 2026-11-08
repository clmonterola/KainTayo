import type { Category, Customer } from "./types";

export type FieldErrors = Record<string, string>;

const EMAIL_RE = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const PHONE_RE = /^(?:\+63|0)9\d{9}$/;
const IMAGE_REF_RE = /^(?:https?:\/\/|\/|storage:\/\/)[^\s]+$/i;

export function trimAll(customer: Customer): Customer {
  return {
    name: customer.name.trim(),
    email: customer.email.trim().toLowerCase(),
    phone: customer.phone.replace(/[\s()-]/g, ""),
    address: customer.address.trim(),
    barangay: customer.barangay.trim(),
    city: customer.city.trim(),
    postalCode: customer.postalCode.trim(),
    notes: customer.notes.trim(),
  };
}

export function validateLogin(email: string, password: string): FieldErrors {
  const errors: FieldErrors = {};
  if (!email.trim()) errors.email = "Enter your email address.";
  else if (!EMAIL_RE.test(email.trim())) errors.email = "That email looks incomplete.";
  if (!password) errors.password = "Enter your password.";
  return errors;
}

export function validateCustomer(customer: Customer): FieldErrors {
  const errors: FieldErrors = {};
  if (customer.name.trim().length < 2) errors.name = "Please enter your full name.";
  if (!EMAIL_RE.test(customer.email.trim()))
    errors.email = "Enter a valid email, e.g. juan@email.com.";
  if (!PHONE_RE.test(customer.phone.replace(/[\s()-]/g, "")))
    errors.phone = "Use a PH mobile number, e.g. 09171234567.";
  if (customer.address.trim().length < 6)
    errors.address = "Include house number and street.";
  if (customer.barangay.trim().length < 2) errors.barangay = "Enter your barangay.";
  if (customer.city.trim().length < 2) errors.city = "Enter your city or municipality.";
  if (!/^\d{4}$/.test(customer.postalCode.trim()))
    errors.postalCode = "Enter a 4-digit postal code.";
  if (customer.notes.length > 240)
    errors.notes = "Keep delivery notes under 240 characters.";
  return errors;
}

export type ProductInput = {
  name: string;
  description: string;
  category: Category;
  price: number;
  image: string;
  available: boolean;
  tag?: string;
  prepMinutes: number;
};

export function validateProduct(input: ProductInput): FieldErrors {
  const errors: FieldErrors = {};
  if (input.name.trim().length < 2 || input.name.trim().length > 80)
    errors.name = "Name must be 2–80 characters.";
  if (input.description.trim().length < 10 || input.description.trim().length > 400)
    errors.description = "Description must be 10–400 characters.";
  if (input.category.trim().length < 2 || input.category.trim().length > 40)
    errors.category = "Category must be 2–40 characters.";
  if (!Number.isFinite(input.price) || input.price < 1 || input.price > 100000)
    errors.price = "Price must be between ₱1 and ₱100,000.";
  if (!input.image.trim()) errors.image = "Add a product image URL or storage reference.";
  else if (!IMAGE_REF_RE.test(input.image.trim()))
    errors.image = "Use an https:// URL or a /storage/… reference.";
  if (!Number.isInteger(input.prepMinutes) || input.prepMinutes < 1 || input.prepMinutes > 240)
    errors.prepMinutes = "Prep time must be 1–240 minutes.";
  if ((input.tag ?? "").length > 24) errors.tag = "Keep the badge under 24 characters.";
  return errors;
}

export function hasErrors(errors: FieldErrors) {
  return Object.keys(errors).length > 0;
}
