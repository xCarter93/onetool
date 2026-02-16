import { convexTest } from "convex-test";
import { describe, it, expect, beforeEach } from "vitest";
import { api } from "./_generated/api";
import { setupConvexTest } from "./test.setup";
import {
	createTestOrg,
	createTestClient,
	createTestIdentity,
	createTestClientProperty,
} from "./test.helpers";

describe("ClientProperties", () => {
	let t: ReturnType<typeof convexTest>;

	beforeEach(() => {
		t = setupConvexTest();
	});

	describe("create", () => {
		it("should create a client property with valid data", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const { clientId } = await t.run(async (ctx) => {
				const clients = await ctx.db
					.query("clients")
					.filter((q) => q.eq(q.field("orgId"), orgId))
					.first();
				return { clientId: clients!._id };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyId = await asUser.mutation(api.clientProperties.create, {
				clientId,
				propertyName: "Main Office",
				propertyType: "commercial",
				streetAddress: "123 Business Ave",
				city: "New York",
				state: "NY",
				zipCode: "10001",
				isPrimary: true,
			});

			expect(propertyId).toBeDefined();

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});
			expect(property).toMatchObject({
				propertyName: "Main Office",
				propertyType: "commercial",
				streetAddress: "123 Business Ave",
				city: "New York",
				state: "NY",
				zipCode: "10001",
				isPrimary: true,
			});
		});

		it("should create a property with minimal required fields", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				await createTestClient(ctx, testOrg.orgId);
				return testOrg;
			});

			const { clientId } = await t.run(async (ctx) => {
				const clients = await ctx.db
					.query("clients")
					.filter((q) => q.eq(q.field("orgId"), orgId))
					.first();
				return { clientId: clients!._id };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyId = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "456 Main St",
				city: "Boston",
				state: "MA",
				zipCode: "02101",
				isPrimary: false,
			});

			expect(propertyId).toBeDefined();

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});
			expect(property).toMatchObject({
				streetAddress: "456 Main St",
				city: "Boston",
				state: "MA",
				zipCode: "02101",
				isPrimary: false,
			});
			expect(property?.propertyName).toBeUndefined();
			expect(property?.propertyType).toBeUndefined();
		});

		it("should throw error when street address is empty", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				await createTestClient(ctx, testOrg.orgId);
				return testOrg;
			});

			const { clientId } = await t.run(async (ctx) => {
				const clients = await ctx.db
					.query("clients")
					.filter((q) => q.eq(q.field("orgId"), orgId))
					.first();
				return { clientId: clients!._id };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.clientProperties.create, {
					clientId,
					streetAddress: "   ",
					city: "Boston",
					state: "MA",
					zipCode: "02101",
					isPrimary: false,
				})
			).rejects.toThrowError("Street address is required");
		});
	});

	describe("list", () => {
		it("should return empty array when no properties exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const properties = await asUser.query(api.clientProperties.list, {});
			expect(properties).toEqual([]);
		});

		it("should return all properties for the organization", async () => {
			const { orgId, clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "100 First St",
					city: "City A",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "200 Second St",
					city: "City B",
				});
				return testOrg;
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const properties = await asUser.query(api.clientProperties.list, {});
			expect(properties).toHaveLength(2);
		});
	});

	describe("listByClient", () => {
		it("should return only properties for the specified client", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId1, clientId2 } =
				await t.run(async (ctx) => {
					const testOrg = await createTestOrg(ctx);
					const clientId1 = await createTestClient(ctx, testOrg.orgId, {
						companyName: "Client One",
					});
					const clientId2 = await createTestClient(ctx, testOrg.orgId, {
						companyName: "Client Two",
					});

					// Create properties for client 1
					await createTestClientProperty(ctx, testOrg.orgId, clientId1, {
						streetAddress: "111 Client1 St",
					});
					await createTestClientProperty(ctx, testOrg.orgId, clientId1, {
						streetAddress: "222 Client1 St",
					});

					// Create property for client 2
					await createTestClientProperty(ctx, testOrg.orgId, clientId2, {
						streetAddress: "333 Client2 St",
					});

					return { ...testOrg, clientId1, clientId2 };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const client1Properties = await asUser.query(
				api.clientProperties.listByClient,
				{ clientId: clientId1 }
			);
			expect(client1Properties).toHaveLength(2);

			const client2Properties = await asUser.query(
				api.clientProperties.listByClient,
				{ clientId: clientId2 }
			);
			expect(client2Properties).toHaveLength(1);
		});
	});

	describe("update", () => {
		it("should update property fields", async () => {
			const { orgId, clerkUserId, clerkOrgId, propertyId } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, testOrg.orgId);
					const propertyId = await createTestClientProperty(
						ctx,
						testOrg.orgId,
						clientId,
						{
							streetAddress: "Original Address",
							city: "Original City",
							propertyType: "residential",
						}
					);
					return { ...testOrg, propertyId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await asUser.mutation(api.clientProperties.update, {
				id: propertyId,
				streetAddress: "Updated Address",
				city: "Updated City",
				propertyType: "commercial",
			});

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});
			expect(property).toMatchObject({
				streetAddress: "Updated Address",
				city: "Updated City",
				propertyType: "commercial",
			});
		});

		it("should throw error when no updates provided", async () => {
			const { clerkUserId, clerkOrgId, propertyId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					testOrg.orgId,
					clientId
				);
				return { ...testOrg, propertyId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.clientProperties.update, {
					id: propertyId,
				})
			).rejects.toThrowError("No valid updates provided");
		});

		it("should throw error when updating street address to empty", async () => {
			const { clerkUserId, clerkOrgId, propertyId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					testOrg.orgId,
					clientId
				);
				return { ...testOrg, propertyId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.clientProperties.update, {
					id: propertyId,
					streetAddress: "   ",
				})
			).rejects.toThrowError("Street address cannot be empty");
		});
	});

	describe("remove", () => {
		it("should delete a property", async () => {
			const { clerkUserId, clerkOrgId, propertyId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					testOrg.orgId,
					clientId
				);
				return { ...testOrg, propertyId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Verify property exists
			const propertyBefore = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});
			expect(propertyBefore).toBeDefined();

			// Delete the property
			await asUser.mutation(api.clientProperties.remove, { id: propertyId });

			// Verify property is deleted
			const propertyAfter = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});
			expect(propertyAfter).toBeNull();
		});
	});

	describe("isPrimary constraint", () => {
		it("should unset existing primary when setting a new primary", async () => {
			const { orgId, clerkUserId, clerkOrgId, clientId } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, testOrg.orgId);
					return { ...testOrg, clientId };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Create first property as primary
			const property1Id = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "100 First St",
				city: "City",
				state: "ST",
				zipCode: "12345",
				isPrimary: true,
			});

			// Create second property as primary
			const property2Id = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "200 Second St",
				city: "City",
				state: "ST",
				zipCode: "12345",
				isPrimary: true,
			});

			// First property should no longer be primary
			const property1 = await asUser.query(api.clientProperties.get, {
				id: property1Id,
			});
			expect(property1?.isPrimary).toBe(false);

			// Second property should be primary
			const property2 = await asUser.query(api.clientProperties.get, {
				id: property2Id,
			});
			expect(property2?.isPrimary).toBe(true);
		});

		it("should allow only one primary property per client via setPrimary", async () => {
			const { clerkUserId, clerkOrgId, property1Id, property2Id } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, testOrg.orgId);
					const property1Id = await createTestClientProperty(
						ctx,
						testOrg.orgId,
						clientId,
						{ streetAddress: "100 First St", isPrimary: true }
					);
					const property2Id = await createTestClientProperty(
						ctx,
						testOrg.orgId,
						clientId,
						{ streetAddress: "200 Second St", isPrimary: false }
					);
					return { ...testOrg, property1Id, property2Id };
				}
			);

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Set property2 as primary using setPrimary mutation
			await asUser.mutation(api.clientProperties.setPrimary, {
				id: property2Id,
			});

			// Property 1 should no longer be primary
			const property1 = await asUser.query(api.clientProperties.get, {
				id: property1Id,
			});
			expect(property1?.isPrimary).toBe(false);

			// Property 2 should now be primary
			const property2 = await asUser.query(api.clientProperties.get, {
				id: property2Id,
			});
			expect(property2?.isPrimary).toBe(true);
		});
	});

	describe("getPrimaryProperty", () => {
		it("should return the primary property for a client", async () => {
			const { clerkUserId, clerkOrgId, clientId, primaryPropertyId } =
				await t.run(async (ctx) => {
					const testOrg = await createTestOrg(ctx);
					const clientId = await createTestClient(ctx, testOrg.orgId);
					await createTestClientProperty(ctx, testOrg.orgId, clientId, {
						streetAddress: "100 Non-Primary St",
						isPrimary: false,
					});
					const primaryPropertyId = await createTestClientProperty(
						ctx,
						testOrg.orgId,
						clientId,
						{
							streetAddress: "200 Primary St",
							isPrimary: true,
						}
					);
					return { ...testOrg, clientId, primaryPropertyId };
				});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const primaryProperty = await asUser.query(
				api.clientProperties.getPrimaryProperty,
				{ clientId }
			);

			expect(primaryProperty).toBeDefined();
			expect(primaryProperty?._id).toBe(primaryPropertyId);
			expect(primaryProperty?.streetAddress).toBe("200 Primary St");
		});

		it("should return null when no primary property exists", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					isPrimary: false,
				});
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const primaryProperty = await asUser.query(
				api.clientProperties.getPrimaryProperty,
				{ clientId }
			);

			expect(primaryProperty).toBeNull();
		});
	});

	describe("search", () => {
		it("should search properties by address", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "123 Oak Street",
					city: "Springfield",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "456 Maple Avenue",
					city: "Riverside",
				});
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const results = await asUser.query(api.clientProperties.search, {
				query: "oak",
			});

			expect(results).toHaveLength(1);
			expect(results[0].streetAddress).toBe("123 Oak Street");
		});

		it("should filter search by property type", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "100 Commercial Blvd",
					propertyType: "commercial",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					streetAddress: "200 Home Lane",
					propertyType: "residential",
				});
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const commercialResults = await asUser.query(api.clientProperties.search, {
				query: "",
				propertyType: "commercial",
			});

			expect(commercialResults).toHaveLength(1);
			expect(commercialResults[0].propertyType).toBe("commercial");
		});
	});

	describe("bulkCreate", () => {
		it("should create multiple properties successfully", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyIds = await asUser.mutation(api.clientProperties.bulkCreate, {
				clientId,
				properties: [
					{
						streetAddress: "100 First St",
						city: "City A",
						state: "CA",
						zipCode: "90001",
						isPrimary: false,
					},
					{
						streetAddress: "200 Second St",
						city: "City B",
						state: "NY",
						zipCode: "10001",
						isPrimary: true,
					},
				],
			});

			expect(propertyIds).toHaveLength(2);

			const properties = await asUser.query(api.clientProperties.listByClient, {
				clientId,
			});
			expect(properties).toHaveLength(2);
		});

		it("should throw error when multiple properties are marked as primary", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			await expect(
				asUser.mutation(api.clientProperties.bulkCreate, {
					clientId,
					properties: [
						{
							streetAddress: "100 First St",
							city: "City A",
							state: "CA",
							zipCode: "90001",
							isPrimary: true,
						},
						{
							streetAddress: "200 Second St",
							city: "City B",
							state: "NY",
							zipCode: "10001",
							isPrimary: true,
						},
					],
				})
			).rejects.toThrowError("Only one property can be marked as primary");
		});
	});

	describe("getStats", () => {
		it("should return correct property statistics", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					propertyType: "residential",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					propertyType: "commercial",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					propertyType: "commercial",
				});
				await createTestClientProperty(ctx, testOrg.orgId, clientId, {
					propertyType: undefined,
				});
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.clientProperties.getStats, {});

			expect(stats.total).toBe(4);
			expect(stats.byType.residential).toBe(1);
			expect(stats.byType.commercial).toBe(2);
			expect(stats.byType.unspecified).toBe(1);
		});

		it("should return zero stats when no properties exist", async () => {
			const { clerkUserId, clerkOrgId } = await t.run(async (ctx) => {
				return await createTestOrg(ctx);
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const stats = await asUser.query(api.clientProperties.getStats, {});

			expect(stats.total).toBe(0);
			expect(stats.byType.residential).toBe(0);
			expect(stats.byType.commercial).toBe(0);
		});
	});

	describe("organization isolation", () => {
		it("should not return properties from other organizations", async () => {
			// Create org 1 with properties
			const { clerkUserId: user1, clerkOrgId: org1Id } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
						orgName: "Organization 1",
					});
					const clientId = await createTestClient(ctx, testOrg.orgId);
					await createTestClientProperty(ctx, testOrg.orgId, clientId, {
						streetAddress: "Org 1 Property",
					});
					return testOrg;
				}
			);

			// Create org 2 with properties
			const { clerkUserId: user2, clerkOrgId: org2Id } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
						orgName: "Organization 2",
					});
					const clientId = await createTestClient(ctx, testOrg.orgId);
					await createTestClientProperty(ctx, testOrg.orgId, clientId, {
						streetAddress: "Org 2 Property",
					});
					return testOrg;
				}
			);

			// User from org 1 should only see org 1 properties
			const asUser1 = t.withIdentity(createTestIdentity(user1, org1Id));
			const org1Properties = await asUser1.query(api.clientProperties.list, {});

			expect(org1Properties).toHaveLength(1);
			expect(org1Properties[0].streetAddress).toBe("Org 1 Property");

			// User from org 2 should only see org 2 properties
			const asUser2 = t.withIdentity(createTestIdentity(user2, org2Id));
			const org2Properties = await asUser2.query(api.clientProperties.list, {});

			expect(org2Properties).toHaveLength(1);
			expect(org2Properties[0].streetAddress).toBe("Org 2 Property");
		});

		it("should not allow accessing properties from other organizations by ID", async () => {
			// Create org 1 with a property
			const { clerkUserId: user1, clerkOrgId: org1Id, propertyId } = await t.run(
				async (ctx) => {
					const testOrg = await createTestOrg(ctx, {
						clerkUserId: "user_org1",
						clerkOrgId: "org_1",
					});
					const clientId = await createTestClient(ctx, testOrg.orgId);
					const propertyId = await createTestClientProperty(
						ctx,
						testOrg.orgId,
						clientId
					);
					return { ...testOrg, propertyId };
				}
			);

			// Create org 2
			const { clerkUserId: user2, clerkOrgId: org2Id } = await t.run(
				async (ctx) => {
					return await createTestOrg(ctx, {
						clerkUserId: "user_org2",
						clerkOrgId: "org_2",
					});
				}
			);

			// User from org 2 should not be able to access org 1's property
			const asUser2 = t.withIdentity(createTestIdentity(user2, org2Id));

			// The query should throw an error for cross-org access
			await expect(
				asUser2.query(api.clientProperties.get, { id: propertyId })
			).rejects.toThrowError("Property does not belong to your organization");
		});
	});

	describe("property types", () => {
		it("should support all property types", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyTypes = [
				"residential",
				"commercial",
				"industrial",
				"retail",
				"office",
				"mixed-use",
			] as const;

			for (const propertyType of propertyTypes) {
				const propertyId = await asUser.mutation(api.clientProperties.create, {
					clientId,
					streetAddress: `${propertyType} property`,
					city: "Test City",
					state: "TS",
					zipCode: "12345",
					propertyType,
					isPrimary: false,
				});

				const property = await asUser.query(api.clientProperties.get, {
					id: propertyId,
				});
				expect(property?.propertyType).toBe(propertyType);
			}

			const allProperties = await asUser.query(
				api.clientProperties.listByClient,
				{ clientId }
			);
			expect(allProperties).toHaveLength(6);
		});
	});

	describe("geocoding fields", () => {
		it("should create property with geocoding data from Mapbox", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyId = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "1600 Pennsylvania Avenue NW",
				city: "Washington",
				state: "DC",
				zipCode: "20500",
				country: "United States",
				isPrimary: true,
				latitude: 38.8977,
				longitude: -77.0365,
				formattedAddress: "1600 Pennsylvania Avenue NW, Washington, DC 20500, United States",
			});

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});

			expect(property).toMatchObject({
				streetAddress: "1600 Pennsylvania Avenue NW",
				city: "Washington",
				state: "DC",
				zipCode: "20500",
				country: "United States",
				latitude: 38.8977,
				longitude: -77.0365,
				formattedAddress: "1600 Pennsylvania Avenue NW, Washington, DC 20500, United States",
			});
		});

		it("should allow creating property without geocoding data", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyId = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "123 No Geocode St",
				city: "Somewhere",
				state: "XX",
				zipCode: "00000",
				isPrimary: false,
			});

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});

			expect(property?.streetAddress).toBe("123 No Geocode St");
			expect(property?.latitude).toBeUndefined();
			expect(property?.longitude).toBeUndefined();
			expect(property?.formattedAddress).toBeUndefined();
		});

		it("should update geocoding fields independently", async () => {
			const { clerkUserId, clerkOrgId, propertyId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				const propertyId = await createTestClientProperty(
					ctx,
					testOrg.orgId,
					clientId,
					{ streetAddress: "Original Address" }
				);
				return { ...testOrg, propertyId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			// Update only geocoding fields
			await asUser.mutation(api.clientProperties.update, {
				id: propertyId,
				latitude: 40.7128,
				longitude: -74.006,
				formattedAddress: "New York, NY, USA",
			});

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});

			expect(property?.streetAddress).toBe("Original Address");
			expect(property?.latitude).toBe(40.7128);
			expect(property?.longitude).toBe(-74.006);
			expect(property?.formattedAddress).toBe("New York, NY, USA");
		});

		it("should store country field in create", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyId = await asUser.mutation(api.clientProperties.create, {
				clientId,
				streetAddress: "10 Downing Street",
				city: "London",
				state: "England",
				zipCode: "SW1A 2AA",
				country: "United Kingdom",
				isPrimary: false,
			});

			const property = await asUser.query(api.clientProperties.get, {
				id: propertyId,
			});

			expect(property?.country).toBe("United Kingdom");
		});

		it("should include geocoding fields in bulkCreate", async () => {
			const { clerkUserId, clerkOrgId, clientId } = await t.run(async (ctx) => {
				const testOrg = await createTestOrg(ctx);
				const clientId = await createTestClient(ctx, testOrg.orgId);
				return { ...testOrg, clientId };
			});

			const asUser = t.withIdentity(createTestIdentity(clerkUserId, clerkOrgId));

			const propertyIds = await asUser.mutation(api.clientProperties.bulkCreate, {
				clientId,
				properties: [
					{
						streetAddress: "100 Geocoded St",
						city: "Test City",
						state: "TS",
						zipCode: "12345",
						isPrimary: false,
						latitude: 34.0522,
						longitude: -118.2437,
						formattedAddress: "100 Geocoded St, Test City, TS 12345",
					},
					{
						streetAddress: "200 No Geocode St",
						city: "Other City",
						state: "OC",
						zipCode: "67890",
						isPrimary: true,
					},
				],
			});

			expect(propertyIds).toHaveLength(2);

			const properties = await asUser.query(api.clientProperties.listByClient, {
				clientId,
			});

			const geocodedProperty = properties.find(
				(p) => p.streetAddress === "100 Geocoded St"
			);
			expect(geocodedProperty?.latitude).toBe(34.0522);
			expect(geocodedProperty?.longitude).toBe(-118.2437);

			const noGeocodeProperty = properties.find(
				(p) => p.streetAddress === "200 No Geocode St"
			);
			expect(noGeocodeProperty?.latitude).toBeUndefined();
			expect(noGeocodeProperty?.longitude).toBeUndefined();
		});
	});
});
