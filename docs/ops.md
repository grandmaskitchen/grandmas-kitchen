# Ops Playbook

## Secrets
- Cloudflare Pages:
  - SUPABASE_URL
  - SUPABASE_SERVICE_ROLE_KEY
  - BACKUP_TOKEN
- GitHub Actions:
  - BACKUP_URL
  - BACKUP_TOKEN

## Backups
- Endpoint: POST /api/admin/backup  (header: X-Backup-Token)
- Storage: Supabase Storage bucket `backups/`
- Nightly automation: .github/workflows/nightly-backup.yml

## Restore
- Endpoint: POST /api/admin/restore  (header: X-Backup-Token)
- Body: { "path": "backups/YYYY/MM/DD/backup-<timestamp>.json" }

## Rollback code (Cloudflare)
- Cloudflare Pages → Deployments → select previous successful build → “Rollback”

## Health check
- /api/diag should return status 200 with Supabase test ok.

## SQL “fixes” worth keeping
- Unique index (dedupe by product_num):
  create unique index if not exists products_product_num_key on public.products (product_num);

- Rebuild view for daily six:
  create or replace view public.home_picks_today as
  select product_num,my_title,amazon_title,my_description_short,image_main
  from public.products
  where approved is true and product_num is not null and image_main is not null
  order by md5(product_num || current_date::text)
  limit 6;

- Clicks table:
  create table if not exists public.clicks (
    id bigserial primary key,
    created_at timestamptz default now(),
    product_num text not null,
    referer text,
    ua text
  );
  create index if not exists clicks_product_num_idx on public.clicks(product_num);
