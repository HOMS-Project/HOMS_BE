/**
 * Logistics Resource Dispatching Engine
 * 
 * Core Philosophy:
 * - Workload (staff) ≠ Vehicle (cargo) ≠ Transport (mobility) ≠ Equipment
 * - Staff → based on workload/time
 * - Truck → based on volume/weight (+ equipment)
 * - Transport → how staff move (bike/van/etc.)
 * - Equipment → separate planning constraint
 */

const TRUCK_USABLE_CAPACITY_RATIO = 0.85;
const WORKLOAD_TO_MINUTES = 8;
const MAX_TOTAL_MULTIPLIER = 3.0;

// Basic vehicle limits based on standard market types in VN
const VEHICLE_TYPES = [
    { type: '500KG', maxWeight: 500, maxVolume: 2.5, seats: 2 },
    { type: '1000KG', maxWeight: 1000, maxVolume: 4.5, seats: 2 },
    { type: '1500KG', maxWeight: 1500, maxVolume: 8, seats: 3 },
    { type: '2000KG', maxWeight: 2000, maxVolume: 12, seats: 3 },
    { type: '5000KG', maxWeight: 5000, maxVolume: 25, seats: 3 }
];

class LogisticsEngine {

    /**
     * 1. MAIN PIPELINE
     * generateDispatchPlan
     */
    generateDispatchPlan(jobData) {
        const { items, surveyData, constraints } = jobData;

        // 1. Equipment Plan
        const equipmentPlan = this.planEquipment(items, surveyData);

        // 2. Staff & Workload
        const { staffTotal, estimatedMinutes, workloadBreakdown } = this.calculateStaffing(items, surveyData);

        // 3. Vehicle Cargo
        const vehicles = this.calculateVehicles(items, equipmentPlan, constraints);

        // 4. Drivers
        const driversRequired = vehicles.reduce((sum, v) => sum + v.trips, 0); // Assuming 1 driver per vehicle per trip roughly, or just number of vehicles if concurrently operating. Let's assume 1 per vehicle.
        const activeVehiclesCount = vehicles.length;

        // 5. Staff Transport
        const transportPlan = this.planTransport(staffTotal, vehicles);

        return {
            vehicles,
            extraTransport: transportPlan,
            equipmentPlan,
            staffTotal,
            driversRequired: activeVehiclesCount,
            estimatedMinutes,
            confidenceLevel: this.calculateConfidence(jobData),
            reasons: [],
            debug: {
                workloadBreakdown
            }
        };
    }

    /**
     * 2. STAFFING LOGIC (Workload Engine)
     */
    calculateStaffing(items, surveyData) {
        const normalizedItems = this.normalizeItems(items);

        let baseWorkload = 0;
        let totalWeight = 0;
        let maxItemWeight = 0;
        let requiresPacking = false;

        normalizedItems.forEach(item => {
            // Rough volume/weight to workload conversion + category base
            let itemWorkload = (item.volume * 2) + (item.weight / 20);
            baseWorkload += itemWorkload;
            totalWeight += item.weight;
            if (item.weight > maxItemWeight) maxItemWeight = item.weight;
            if (item.requiresPacking) requiresPacking = true;
        });

        // Apply Multipliers
        let floorMultiplier = 1.0;
        if (surveyData?.floors > 0 && !surveyData?.hasElevator) {
            floorMultiplier = 1 + (surveyData.floors * 0.2); // +20% per floor
        }

        let distanceMultiplier = 1.0;
        if (surveyData?.carryDistance > 20) {
            distanceMultiplier = 1 + ((surveyData.carryDistance - 20) / 100 * 0.1); // +10% per 10m over 20m
        }

        let packingMultiplier = requiresPacking ? 1.5 : 1.0;

        let totalMultiplier = floorMultiplier * distanceMultiplier * packingMultiplier;
        if (totalMultiplier > MAX_TOTAL_MULTIPLIER) {
            totalMultiplier = MAX_TOTAL_MULTIPLIER; // Soft cap
        }

        const adjustedWorkload = baseWorkload * totalMultiplier;

        // Convert to minutes
        let estimatedMinutes = Math.round(adjustedWorkload * WORKLOAD_TO_MINUTES);
        if (estimatedMinutes < 60) estimatedMinutes = 60; // Min job duration

        const durationExceeded = estimatedMinutes > 720; // 12 hours

        // Staff count
        let staffTotal = Math.ceil(adjustedWorkload / 50); // Threshold heuristic

        // Clamping constraints
        if (staffTotal < 2) staffTotal = 2; // Min staff
        if (maxItemWeight > 200 && staffTotal < 3) staffTotal = 3; // Heavy item
        if (staffTotal > 5) staffTotal = 5; // Max staff limit per typical job

        return {
            staffTotal,
            estimatedMinutes,
            workloadBreakdown: {
                baseWorkload,
                totalMultiplier,
                adjustedWorkload
            }
        };
    }

    normalizeItems(items) {
        return items.map(item => ({
            name: item.name,
            volume: item.volume || (item.length * item.width * item.height) || 0.1,
            weight: item.weight || 10,
            requiresPacking: !!item.requiresPacking
        }));
    }

    /**
     * 3. VEHICLE MODEL
     */
    calculateVehicles(items, equipmentPlan, constraints) {
        const totalItemVolume = items.reduce((sum, item) => sum + (item.volume || 0), 0);
        const totalItemWeight = items.reduce((sum, item) => sum + (item.weight || 0), 0);

        // Equipment volume included
        const totalVolume = totalItemVolume + equipmentPlan.totalVolume;
        const totalWeight = totalItemWeight + equipmentPlan.totalWeight;

        // Apply constraints like road bans
        let maxAllowedWeight = Infinity;
        if (constraints?.roadBanWeightLimit) {
            maxAllowedWeight = constraints.roadBanWeightLimit;
        }

        // Find smallest vehicle that fits capacity
        let assignedVehicles = [];
        let remainingVol = totalVolume;
        let remainingWeight = totalWeight;

        // Greedy approach finding the largest allowed that fits, or multiple
        while (remainingVol > 0 || remainingWeight > 0) {
            // Filter by road ban
            const allowedTypes = VEHICLE_TYPES.filter(v => v.maxWeight <= maxAllowedWeight);
            if (allowedTypes.length === 0) throw new Error("No vehicles fit the road restriction");

            // Sort by capacity DESC
            allowedTypes.sort((a, b) => b.maxWeight - a.maxWeight);

            let selected = null;
            // Find the smallest that fits the remainder, else pick the largest allowed
            for (let i = allowedTypes.length - 1; i >= 0; i--) {
                let effectiveVol = allowedTypes[i].maxVolume * TRUCK_USABLE_CAPACITY_RATIO;
                if (effectiveVol >= remainingVol && allowedTypes[i].maxWeight >= remainingWeight) {
                    selected = { ...allowedTypes[i], trips: 1, effectiveVol };
                    break;
                }
            }

            if (!selected) {
                // Pick the largest allowed and loop again
                let v = allowedTypes[0];
                selected = { ...v, trips: 1, effectiveVol: v.maxVolume * TRUCK_USABLE_CAPACITY_RATIO };
            }

            assignedVehicles.push({
                type: selected.type,
                trips: selected.trips,
                assignedStaff: 0 // to be filled later or by transport plan
            });

            remainingVol -= selected.effectiveVol;
            remainingWeight -= selected.maxWeight;
        }

        return assignedVehicles;
    }

    /**
     * 4. TRANSPORT LAYER
     */
    planTransport(staffTotal, vehicles) {
        // Driver takes 1 seat in each vehicle. The remaining seats are for staff.
        // E.g., a 2-seat truck has 1 driver + 1 staff
        let totalTruckSeatsForStaff = vehicles.reduce((sum, v) => {
            const seatsForStaff = Math.max(0, (VEHICLE_TYPES.find(vt => vt.type === v.type)?.seats || 2) - 1);
            return sum + seatsForStaff;
        }, 0);

        let missingSeats = staffTotal - totalTruckSeatsForStaff;

        let extraTransport = {
            motorbikes: 0,
            taxis: 0,
            staffOnBikes: 0,
            staffInVan: 0,
            staffOnTrucks: Math.min(staffTotal, totalTruckSeatsForStaff)
        };

        if (missingSeats > 0) {
            // Scenario B - Not enough seats
            // Default to personal bikes per missing seat
            extraTransport.motorbikes = missingSeats;
            extraTransport.staffOnBikes = missingSeats;
        }

        return extraTransport;
    }

    /**
     * 5. EQUIPMENT LAYER
     */
    planEquipment(items, surveyData) {
        let plan = {
            onTruck: ['Khăn trải', 'Dây cột', 'Công cụ cơ bản', 'Xe đẩy'],
            viaStaff: [],
            preDelivered: false,
            totalVolume: 0.5, // 0.5 CBM base for essential
            totalWeight: 10   // 10 kg base
        };

        if (surveyData?.requiresCartons > 0) {
            if (surveyData.requiresCartons > 50) {
                plan.preDelivered = true;
            } else {
                plan.onTruck.push(`${surveyData.requiresCartons} cartons`);
                plan.totalVolume += surveyData.requiresCartons * 0.05; // 0.05 CBM each loosely packed
                plan.totalWeight += surveyData.requiresCartons * 0.5; // 0.5kg each
            }
        }

        return plan;
    }

    calculateConfidence(jobData) {
        let score = 100;
        // Penalities for missing fields
        if (!jobData.items || jobData.items.length === 0) score -= 30;
        if (!jobData.surveyData) score -= 20;
        return score + '%';
    }
}

module.exports = new LogisticsEngine();