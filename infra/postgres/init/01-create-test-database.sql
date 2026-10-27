-- Runs once, when the Postgres volume is first created. Integration tests use this database, never the dev one
-- (apps/api/test/global-setup.ts refuses any database whose name does not end in "_test").
CREATE DATABASE vachelearn_test OWNER vachelearn;
