-- Carrousels : une image par diapositive. 0 = la couverture, ou le visuel unique d'une pub ou d'un post simple ;
-- n = la diapositive de rang n (même numérotation que ads.slides, qui commence à 0).
alter table ad_images add column if not exists slide smallint not null default 0 check (slide >= 0);

create index if not exists ad_images_ad_slide on ad_images (ad_id, slide, created_at desc);
