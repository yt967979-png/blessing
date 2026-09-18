CREATE OR REPLACE FUNCTION notify_books_changed() RETURNS trigger AS $$
DECLARE
  v_payload text;
  v_mrp numeric;
  v_sale numeric;
  v_price numeric;
  v_discount int;
  v_instock boolean;
  v_stock int;
BEGIN
  IF (TG_OP = 'DELETE') THEN
    v_payload := json_build_object(
      'type', 'CATALOG_CHANGED',
      'bookIds', json_build_array(OLD.id),
      'timestamp', (extract(epoch from now())*1000)::bigint
    )::text;
    PERFORM pg_notify('stock_changed', v_payload);
    RETURN OLD;
  END IF;

  v_mrp := COALESCE(NEW.price, 0);
  v_sale := CASE 
    WHEN NEW.discount_price IS NOT NULL AND NEW.discount_price > 0 AND NEW.discount_price < v_mrp 
    THEN NEW.discount_price 
    ELSE v_mrp 
  END;
  v_price := v_sale;
  v_discount := CASE 
    WHEN v_mrp > 0 AND v_price < v_mrp 
    THEN ROUND(((v_mrp - v_price) / v_mrp) * 100) 
    ELSE 0 
  END;
  v_stock := GREATEST(0, COALESCE(NEW.stock, 0));
  v_instock := (v_stock > 0 AND COALESCE(NEW.status, 'published') = 'published');

  -- 1. Direct memory push: price & stock update instantly in client state (<50ms, 0 HTTP delay)
  v_payload := json_build_object(
    'type', 'STOCK_CHANGED',
    'books', json_build_array(
      json_build_object(
        'id', NEW.id,
        'stock', v_stock,
        'status', COALESCE(NEW.status, 'published'),
        'inStock', v_instock,
        'price', v_price,
        'mrp', v_mrp,
        'discount', v_discount
      )
    ),
    'timestamp', (extract(epoch from now())*1000)::bigint
  )::text;
  PERFORM pg_notify('stock_changed', v_payload);

  -- 2. Full catalog sync: handles new books, title, image, badge changes
  PERFORM pg_notify('stock_changed', json_build_object(
    'type', 'CATALOG_CHANGED',
    'bookIds', json_build_array(NEW.id),
    'timestamp', (extract(epoch from now())*1000)::bigint
  )::text);

  RETURN NEW;
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_books_changed ON books;
CREATE TRIGGER trg_books_changed
AFTER INSERT OR UPDATE OR DELETE ON books
FOR EACH ROW EXECUTE FUNCTION notify_books_changed();
