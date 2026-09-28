import subprocess

sql = """
SELECT 
  (SELECT count(*) FROM books WHERE stock < 0 OR stock_tamil < 0 OR stock_english < 0) AS negative_stock_count,
  (SELECT count(*) FROM order_items oi LEFT JOIN orders o ON oi.order_id = o.id WHERE o.id IS NULL) AS orphaned_order_items,
  (SELECT count(*) FROM payments p LEFT JOIN orders o ON p.order_id = o.id WHERE o.id IS NULL) AS orphaned_payments,
  (SELECT count(*) FROM stock_holds WHERE status = 'held' AND expires_at < now()) AS stale_unreleased_holds,
  (SELECT count(*) FROM (SELECT order_number, count(*) FROM orders GROUP BY order_number HAVING count(*) > 1) d1) AS duplicate_order_numbers,
  (SELECT count(*) FROM (SELECT razorpay_payment_id, count(*) FROM orders WHERE razorpay_payment_id IS NOT NULL AND razorpay_payment_id != '' GROUP BY razorpay_payment_id HAVING count(*) > 1) d2) AS duplicate_payment_ids,
  (SELECT count(*) FROM (SELECT razorpay_order_id, count(*) FROM orders WHERE razorpay_order_id IS NOT NULL AND razorpay_order_id != '' GROUP BY razorpay_order_id HAVING count(*) > 1) d3) AS duplicate_razorpay_order_ids,
  (SELECT count(*) FROM coupons WHERE max_uses IS NOT NULL AND used_count > max_uses) AS overused_coupons;
"""

p = subprocess.run(["sudo", "-u", "postgres", "psql", "-d", "blessing"], input=sql, text=True, capture_output=True)
print(p.stdout)
