CREATE OR REPLACE FUNCTION notify_books_changed() RETURNS trigger AS $$
DECLARE
  v_payload text;
BEGIN
  v_payload := json_build_object(
    'type', 'CATALOG_CHANGED',
    'bookIds', json_build_array(COALESCE(NEW.id, OLD.id)),
    'timestamp', (extract(epoch from now())*1000)::bigint
  )::text;
  PERFORM pg_notify('stock_changed', v_payload);
  RETURN COALESCE(NEW, OLD);
END;
$$ LANGUAGE plpgsql;

DROP TRIGGER IF EXISTS trg_books_changed ON books;
CREATE TRIGGER trg_books_changed
AFTER INSERT OR UPDATE OR DELETE ON books
FOR EACH ROW EXECUTE FUNCTION notify_books_changed();
