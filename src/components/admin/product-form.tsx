"use client";

import { useEffect, useState, type FormEvent } from "react";
import type { Product } from "@/lib/types";
import {
  createProduct,
  updateProduct,
  type ProductPayload,
} from "@/lib/services/products";
import { ApiClientError } from "@/lib/api-client";
import { cn, formatPeso } from "@/lib/format";
import { hasErrors, validateProduct, type FieldErrors } from "@/lib/validation";
import { useToast } from "@/components/providers/toast-provider";
import { Button } from "@/components/ui/button";
import { Field, Input, Textarea } from "@/components/ui/input";
import { Modal } from "@/components/ui/modal";

const FORM_ID = "product-form";

export function ProductForm({
  product,
  categories,
  onClose,
  onSaved,
}: {
  product: Product | null;
  categories: string[];
  onClose: () => void;
  onSaved: (product: Product) => void;
}) {
  const { push } = useToast();
  const [name, setName] = useState(product?.name ?? "");
  const [description, setDescription] = useState(product?.description ?? "");
  const [category, setCategory] = useState(product?.category ?? "");
  const [priceText, setPriceText] = useState(product ? String(product.price) : "");
  const [prepText, setPrepText] = useState(product ? String(product.prepMinutes) : "15");
  const [tag, setTag] = useState(product?.tag ?? "");
  const [image, setImage] = useState(product?.image ?? "");
  const [available, setAvailable] = useState(product?.available ?? true);
  const [previewBroken, setPreviewBroken] = useState(false);
  const [errors, setErrors] = useState<FieldErrors>({});
  const [banner, setBanner] = useState("");
  const [saving, setSaving] = useState(false);

  const price = Number(priceText);
  const previewPrice = Number.isFinite(price) && price > 0 ? price : 0;

  useEffect(() => {
    setPreviewBroken(false);
  }, [image]);

  async function submit(event: FormEvent<HTMLFormElement>) {
    event.preventDefault();
    setBanner("");

    const payload: ProductPayload = {
      name: name.trim(),
      description: description.trim(),
      category: category.trim(),
      price,
      image: image.trim(),
      available,
      tag: tag.trim(),
      prepMinutes: Number(prepText),
    };

    const localErrors = validateProduct(payload);
    if (hasErrors(localErrors)) {
      setErrors(localErrors);
      const first = Object.keys(localErrors)[0];
      document.getElementById(first)?.focus();
      return;
    }

    setErrors({});
    setSaving(true);
    try {
      const result = product
        ? await updateProduct(product.id, payload)
        : await createProduct(payload);
      onSaved(result);
      push({
        title: product ? "Dish updated" : "Dish added",
        description: `${result.name} · ${formatPeso(result.price)}`,
        variant: "success",
      });
    } catch (error) {
      setSaving(false);
      if (error instanceof ApiClientError) {
        setBanner(error.message);
        if (error.fields) {
          setErrors(error.fields);
          const first = Object.keys(error.fields)[0];
          document.getElementById(first)?.focus();
        }
        push({ title: "Could not save the dish", description: error.message, variant: "error" });
      } else {
        setBanner("Something went wrong while saving. Please try again.");
      }
    }
  }

  return (
    <Modal
      open
      onClose={onClose}
      title={product ? `Edit ${product.name}` : "Add a new dish"}
      description={
        product
          ? "Update the details customers see on the menu."
          : "It will be saved through the product API and appear on the customer menu."
      }
      size="lg"
      footer={
        <>
          <Button variant="secondary" onClick={onClose} disabled={saving}>
            Cancel
          </Button>
          <Button type="submit" form={FORM_ID} loading={saving}>
            {product ? "Save changes" : "Add to menu"}
          </Button>
        </>
      }
    >
      <form id={FORM_ID} onSubmit={submit} noValidate className="space-y-5">
        {banner ? (
          <p className="rounded-2xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {banner}
          </p>
        ) : null}

        <div className="grid gap-4 sm:grid-cols-2">
          <Field
            label="Dish name"
            htmlFor="name"
            error={errors.name}
            required
            className="sm:col-span-2"
          >
            <Input
              id="name"
              placeholder="Enter the dish name"
              value={name}
              onChange={(event) => setName(event.target.value)}
              invalid={Boolean(errors.name)}
              maxLength={80}
            />
          </Field>

          <Field
            label="Category"
            htmlFor="category"
            error={errors.category}
            required
            hint={
              categories.length > 0
                ? "Pick an existing category or type a new one."
                : "No categories yet — type the first one."
            }
          >
            <Input
              id="category"
              list="product-categories"
              placeholder="Type a category"
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              invalid={Boolean(errors.category)}
              maxLength={40}
              autoComplete="off"
            />
            <datalist id="product-categories">
              {categories.map((entry) => (
                <option key={entry} value={entry} />
              ))}
            </datalist>
          </Field>

          <Field
            label="Badge (optional)"
            htmlFor="tag"
            error={errors.tag}
            hint="Optional label shown on the menu card."
          >
            <Input
              id="tag"
              placeholder="Optional"
              value={tag}
              onChange={(event) => setTag(event.target.value)}
              invalid={Boolean(errors.tag)}
              maxLength={24}
            />
          </Field>

          <Field label="Price" htmlFor="price" error={errors.price} required>
            <div className="relative">
              <span className="pointer-events-none absolute inset-y-0 left-4 flex items-center text-sm font-semibold text-muted">
                ₱
              </span>
              <Input
                id="price"
                type="number"
                inputMode="numeric"
                min={1}
                step={1}
                placeholder="0"
                value={priceText}
                onChange={(event) => setPriceText(event.target.value)}
                invalid={Boolean(errors.price)}
                className="pl-8"
              />
            </div>
          </Field>

          <Field label="Prep time (minutes)" htmlFor="prepMinutes" error={errors.prepMinutes} required>
            <Input
              id="prepMinutes"
              type="number"
              inputMode="numeric"
              min={1}
              max={240}
              step={1}
              placeholder="15"
              value={prepText}
              onChange={(event) => setPrepText(event.target.value)}
              invalid={Boolean(errors.prepMinutes)}
            />
          </Field>

          <Field
            label="Description"
            htmlFor="description"
            error={errors.description}
            required
            className="sm:col-span-2"
          >
            <Textarea
              id="description"
              placeholder="Describe the dish, its ingredients, and what makes it special."
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              invalid={Boolean(errors.description)}
              maxLength={400}
            />
          </Field>
        </div>

        <div className="space-y-2">
          <p className="flex items-center gap-1 text-[13px] font-semibold text-ink">
            Dish photo <span className="text-brand">*</span>
          </p>
          <div className="relative overflow-hidden rounded-2xl border border-line bg-cream-deep">
            {image && !previewBroken ? (
              <img
                src={image}
                alt=""
                className="aspect-[16/7] w-full object-cover"
                onError={() => setPreviewBroken(true)}
              />
            ) : (
              <div className="flex aspect-[16/7] flex-col items-center justify-center gap-2 px-6 text-center text-xs text-muted">
                <svg
                  viewBox="0 0 24 24"
                  className="size-7"
                  fill="none"
                  stroke="currentColor"
                  strokeWidth="1.5"
                  aria-hidden="true"
                >
                  <rect x="3" y="4" width="18" height="16" rx="3" />
                  <circle cx="9" cy="10" r="1.5" />
                  <path d="m4.5 17 5-5 3 3 2.5-2.5 4.5 4.5" strokeLinecap="round" strokeLinejoin="round" />
                </svg>
                <span>
                  {image
                    ? "Preview unavailable — check the image URL."
                    : "Add an image URL to see a preview."}
                </span>
              </div>
            )}
            <span className="absolute right-3 bottom-3 rounded-full bg-ink/85 px-3 py-1 text-xs font-semibold text-cream backdrop-blur">
              {previewPrice > 0 ? formatPeso(previewPrice) : "Set a price"}
            </span>
          </div>
          <Field
            label="Image URL or storage reference"
            htmlFor="image"
            error={errors.image}
            hint="Paste an https:// image URL or a /storage/… reference. Uploads can be connected to your storage provider later."
          >
            <Input
              id="image"
              placeholder="https://… or /storage/…"
              value={image}
              onChange={(event) => setImage(event.target.value)}
              invalid={Boolean(errors.image)}
              maxLength={500}
              autoComplete="off"
            />
          </Field>
        </div>

        <div className="flex items-center justify-between gap-4 rounded-2xl border border-line bg-cream/60 px-4 py-3">
          <div>
            <p className="text-sm font-semibold text-ink">Available for ordering</p>
            <p className="text-[11px] text-muted">
              Turn off to show the dish as sold out without deleting it.
            </p>
          </div>
          <button
            type="button"
            role="switch"
            aria-checked={available}
            aria-label="Available for ordering"
            onClick={() => setAvailable((value) => !value)}
            className={cn(
              "relative h-6 w-11 shrink-0 rounded-full transition",
              available ? "bg-leaf" : "bg-line",
            )}
          >
            <span
              className={cn(
                "absolute top-0.5 size-5 rounded-full bg-white shadow transition-all",
                available ? "left-[1.4rem]" : "left-0.5",
              )}
            />
          </button>
        </div>
      </form>
    </Modal>
  );
}
