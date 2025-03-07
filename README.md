## Orbiter Analytics

This is a simple analytics server that makes use of SQLite for analytics data storage. For more robust solutions, please choose the analytics provider you like best. 

### Running Locally

To run this server locally, you'll need to follow these steps: 

1. Clone the repository: `git clone https://github.com/orbiterhost/orbiter-analytics.git`
2. Change into the directory: `ch orbiter-analytics`
3. Install dependencies: `npm i`

Before you can start the server, you will need to create a `.env` file in the root of the project. Add you own variables for the following keys: 

```
ADMIN_KEY=
PORT=5001
PINATA_JWT=
```

You can get the `PINATA_JWT` from your own Pinata account. The `ADMIN_KEY` should be a secure key you create yourself. This key should match the key used in the `orbiter-backend` code. In that code, the variable is called `ORBITER_ANALYTICS_TOKEN`. 

Now, you can run the server with: 

```
npm run dev
```

When ready to deploy to production, you'll need to build the server code and then use the start command: 

```
npm run build
npm run start
```