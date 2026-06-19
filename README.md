# InsightAI — Server

Node.js/Express REST API with MongoDB for the InsightAI platform.

## Setup

```bash
cd server
npm install
cp .env.example .env   # fill in your values
npm run dev
```

## Environment Variables

| Variable | Description |
|---|---|
| `PORT` | Port to run the server (default: 5000) |
| `MONGO_URI` | MongoDB connection string |
| `JWT_SECRET` | Secret key for signing JWT tokens |
| `JWT_EXPIRE` | Token expiry (e.g. `7d`) |
| `ML_SERVICE_URL` | URL of the Python ML microservice |
| `MAX_FILE_SIZE` | Max CSV upload size in bytes (default: 10MB) |
| `CLIENT_URL` | Frontend URL for CORS (default: http://localhost:3000) |

## API Endpoints

### Auth
| Method | Route | Description |
|---|---|---|
| POST | `/api/auth/register` | Register new user |
| POST | `/api/auth/login` | Login |
| GET | `/api/auth/me` | Get current user (protected) |
| PUT | `/api/auth/update-password` | Update password (protected) |

### Datasets
| Method | Route | Description |
|---|---|---|
| POST | `/api/datasets/upload` | Upload CSV file (protected) |
| GET | `/api/datasets` | List user's datasets (protected) |
| GET | `/api/datasets/:id` | Get single dataset (protected) |
| DELETE | `/api/datasets/:id` | Delete dataset + all data (protected) |

### Analytics
| Method | Route | Description |
|---|---|---|
| GET | `/api/analytics/:datasetId/summary` | Overview stats + revenue trend |
| GET | `/api/analytics/:datasetId/segments` | Customer segments (filter: `?segment=Premium`) |
| GET | `/api/analytics/:datasetId/forecasts` | Revenue forecasts (filter: `?type=monthly`) |
| GET | `/api/analytics/:datasetId/insights` | AI-generated plain-English insights |
| GET | `/api/analytics/:datasetId/top-products` | Top products by revenue |
| GET | `/api/analytics/:datasetId/categories` | Revenue by category |

## CSV Format

The upload endpoint accepts CSVs with flexible column names. Supported aliases:

| Field | Accepted column names |
|---|---|
| Transaction ID | `transaction_id`, `order_id`, `id` |
| Customer ID | `customer_id`, `customer`, `client_id` |
| Date | `date`, `order_date`, `transaction_date` |
| Quantity | `quantity`, `qty` |
| Unit Price | `unit_price`, `price` |
| Total Amount | `total_amount`, `revenue`, `total`, `amount` |
| Category | `category`, `product_category` |

## Architecture

```
server/
├── controllers/       # Request handlers (auth, dataset, analytics)
├── models/            # Mongoose schemas (User, Dataset, SalesTransaction, Customer, CustomerSegment, Forecast, Insight)
├── routes/            # Express routers
├── middleware/        # JWT auth + Multer upload
├── uploads/           # Uploaded CSV files (gitignored)
└── server.js          # App entry point
```
