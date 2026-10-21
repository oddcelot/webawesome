import { glob } from 'astro/loaders';
import { z } from 'astro/zod';
import { defineCollection } from 'astro:content';

const stringList = z
  .union([z.string(), z.array(z.string())])
  .transform(value => (Array.isArray(value) ? value : [value]));

/** Every front matter key the docs use. Unknown keys fail the build so typos don't go unnoticed. */
const pageSchema = z
  .object({
    title: z.string().optional(),
    description: z.string().optional(),
    // Astro reserves `layout` in MDX front matter (it imports it as a layout component), hence `pageLayout`
    pageLayout: z.union([z.string(), z.literal(false)]).optional(),
    permalink: z.string().optional(),
    category: z.string().optional(),
    parent: z.string().optional(),
    order: z.number().optional(),
    tags: stringList.optional(),
    'override:tags': stringList.optional(),
    synonyms: z.array(z.string()).optional(),
    'use-cases': z.array(z.string()).optional(),
    officialDocs: z.string().optional(),
    frameworks: z.array(z.record(z.string(), z.any())).optional(),
    noindex: z.boolean().optional(),
    unlisted: z.boolean().optional(),
    unpublished: z.boolean().optional(),
    excludeFromCollections: z.boolean().optional(),
    sidebarHidden: z.boolean().optional(),
    isProComponent: z.boolean().optional(),
    pageClass: z.string().optional(),
    hasAnatomy: z.boolean().optional(),
    hasOutline: z.boolean().optional(),
    hasSidebar: z.boolean().optional(),
    hasBreadcrumbs: z.boolean().optional(),
    hasProseContent: z.boolean().optional(),
    hasGeneratedTitle: z.boolean().optional(),
    hasFramedMain: z.boolean().optional(),
    hasLinkify: z.boolean().optional(),
    ogTitle: z.string().optional(),
    ogDescription: z.string().optional(),
    ogImage: z.string().optional(),
    ogUrl: z.string().optional(),
    ogType: z.string().optional(),
  })
  .strict();

const pages = defineCollection({
  loader: glob({
    pattern: ['**/*.mdx', '!_*/**', '!src/**', '!public/**', '!node_modules/**'],
    base: '.',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: pageSchema,
});

const faqs = defineCollection({
  loader: glob({
    pattern: '**/*.mdx',
    base: './_faqs',
    generateId: ({ entry }) => entry.replace(/\.mdx$/, ''),
  }),
  schema: z
    .object({
      question: z.string(),
      order: z.number().optional(),
      synonyms: z.array(z.string()).optional(),
      source: z.string().optional(),
    })
    .strict(),
});

export const collections = { pages, faqs };
