---
code: SUMMER10          # required
amount: 10              # percent off
status: Approved        # required; other values will be rejected
starts: 2025-08-01      # optional (ISO date or ISO datetime)
expires: 2025-09-30T23:59:59-07:00   # optional
minSubtotal: 2         # optional: order must meet this pre-discount
# email: alice@example.com           # optional: restrict to one email
# emails: [a@x.com, b@y.com]        # optional: restrict to a list
# allowedDomains: [ company.com ]   # optional: restrict to domain
---
Approved: 10% off summer promo.
