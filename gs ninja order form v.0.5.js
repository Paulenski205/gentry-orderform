// Main JavaScript File

// Message Handling System (Improved)
const MessageSystem = {
    pendingRequests: new Map(),

    sendMessage(type, data = {}) {
        return new Promise((resolve, reject) => {
            const messageId = this.generateMessageId();

            this.pendingRequests.set(messageId, { resolve, reject, type });

            window.parent.postMessage({ messageId, type, data }, '*');

            // Timeout mechanism
            setTimeout(() => {
                if (this.pendingRequests.has(messageId)) {
                    this.pendingRequests.delete(messageId);
                    reject(new Error(`Request timed out for ${type}`));
                }
            }, 30000); // 30-second timeout
        });
    },

    handleResponse(event) {
        const { messageId, success, result, error } = event.data;
        const request = this.pendingRequests.get(messageId);

        if (request) {
            this.pendingRequests.delete(messageId);
            if (success) {
                request.resolve(result); // Resolve with the result
            } else {
                request.reject(new Error(error || 'Backend operation failed'));
            }
        }
    },

    generateMessageId() {
        return `msg_${Date.now()}_${Math.random().toString(36).substring(2, 15)}`;
    }
};

window.addEventListener('message', MessageSystem.handleResponse.bind(MessageSystem));

// Constants and Initial Setup
const TAX_RATE = 0.086; // 8.6%
let currentQuoteId = localStorage.getItem('lastQuoteId') || 0;
let rooms = []; // Initialize rooms here
let modal; // Declare modal here
let closeBtn; // Declare closeBtn here
let currentRoomId = 'room-1';


// Money formatting helper function
const formatMoney = (amount) => {
    return new Intl.NumberFormat('en-US', {
        style: 'currency',
        currency: 'USD',
        minimumFractionDigits: 2,
        maximumFractionDigits: 2
    }).format(amount);
};

// Core Navigation Functions
window.showMainMenu = function() {
    document.getElementById('welcome-container').style.display = 'none';
    document.getElementById('main-menu-container').style.display = 'block';
    document.getElementById('create-quote-container').style.display = 'none';
}

function showCreateQuote(isNewQuote = true) {
    if (isNewQuote) { // Only clear data if it's a new quote
        // Reset rooms array and localStorage
        rooms = ['Room 1'];
        currentRoomId = 'room-1';
        localStorage.setItem('rooms', JSON.stringify(rooms));

        // Reset the title header
        const createQuoteHeader = document.querySelector('#create-quote-container h2');
        if (createQuoteHeader) {
            createQuoteHeader.textContent = 'Create New Quote';
        }

        // Clear all room data from localStorage
        for (let i = 1; i <= 10; i++) {
            localStorage.removeItem(`room-${i}`);
        }

        // Reset form fields
        document.getElementById('room-name').value = 'Room 1';
        
        // Clear wall measurements
        const baseWalls = document.querySelectorAll('#base-walls input');
        const upperWalls = document.querySelectorAll('#upper-walls input');
        baseWalls.forEach(input => input.value = '');
        upperWalls.forEach(input => input.value = '');

        // Reset all options
        const options = document.querySelectorAll('.options-form select, .options-form input');
        options.forEach(option => {
            if (option.tagName === 'SELECT') {
                option.selectedIndex = 0;
            } else {
                option.value = '';
            }
        });

        // Reset additional options
        document.getElementById('tax-type').selectedIndex = 0;
        document.getElementById('installation-type').selectedIndex = 0;
        document.getElementById('installation-surcharge').value = '0.00';
        document.getElementById('discount').value = '0.00';

        // Initialize room selector
        initializeRoomSelector();
    }

    // These actions happen regardless of isNewQuote
    // Update display
    document.getElementById('welcome-container').style.display = 'none';
    document.getElementById('main-menu-container').style.display = 'none';
    document.getElementById('create-quote-container').style.display = 'block';

    // Update calculations
    updateLinearFootage();
    updateCostBreakdown();
}

async function showOrderHistory() {
    try {
        console.log('Fetching order history...');

        // Create and show the modal with loading state
        const modal = document.createElement('div');
        modal.className = 'modal';
        modal.id = 'orderHistoryModal';
        modal.innerHTML = `
            <div class="modal-content">
                <div class="modal-header">
                    <h2>Order History</h2>
                    <span class="close">&times;</span>
                </div>
                <div class="modal-body">
                    <div class="quotes-list">
                        <div class="loading">Loading quotes...</div>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
        modal.style.display = 'block';

        // Use MessageSystem to get quotes
        const quotes = await MessageSystem.sendMessage('getQuotes');

        const quotesListDiv = modal.querySelector('.quotes-list');

        if (quotes && quotes.length > 0) {
            // Render quotes
            quotesListDiv.innerHTML = quotes.map(quote => `
                <div class="quote-item" data-quote-id="${quote.id}">
                    <div class="quote-header">
                        <span class="project-name">${quote.projectName}</span>
                        <span class="quote-date">${new Date(quote.timestamp).toLocaleDateString()}</span>
                    </div>
                    <div class="quote-details">
                        <div>Quote ID: ${quote.id}</div>
                        <div>Total: ${formatMoney(quote.finalTotal)}</div>
                        <div>Status: ${quote.status || 'Pending'}</div>
                    </div>
                    <button onclick="loadQuote('${quote.id}')">Load Quote</button>
                </div>
            `).join('');

        } else {
            quotesListDiv.innerHTML = '<div class="no-quotes">No quotes found</div>';
        }


        // Add close button functionality
        const closeBtn = modal.querySelector('.close');
        closeBtn.onclick = () => {
            modal.style.display = 'none';
            modal.remove();
        };

        // Add click outside modal to close
        modal.addEventListener('click', (event) => {
            if (event.target === modal) {
                modal.style.display = 'none';
                modal.remove();
            }
        });

    } catch (error) {
        console.error('Error showing order history:', error);
        const quotesListDiv = document.getElementById('orderHistoryModal')?.querySelector('.quotes-list');
        if (quotesListDiv) {
            quotesListDiv.innerHTML = `<div class="error">Error loading quotes: ${error.message || 'Unknown error'}</div>`;
        } else {
            showNotification('Error loading order history: ' + error.message, 'error');
        }
    }
}

function goToMainMenu() {
    document.getElementById('create-quote-container').style.display = 'none';
    document.getElementById('main-menu-container').style.display = 'block';
}

function initializeEventListeners() {
    // Wall measurement listeners
    const baseWalls = document.querySelectorAll('#base-walls input');
    const upperWalls = document.querySelectorAll('#upper-walls input');
    
    [...baseWalls, ...upperWalls].forEach(input => {
        input.addEventListener('input', () => {
            saveCurrentRoomData(); // Save immediately when measurements change
            updateLinearFootage();
            updateCostBreakdown();
        });
    });

    // Options change listeners - Update this section
    const optionsSelects = document.querySelectorAll('.options-form select');
    optionsSelects.forEach(select => {
        select.addEventListener('change', () => {
            console.log('Option changed:', select.id, select.value);
            saveCurrentRoomData(); // Save immediately when options change
            updateCostBreakdown();
        });
    });

    const optionsInputs = document.querySelectorAll('.options-form input[type="text"]');
    optionsInputs.forEach(input => {
        input.addEventListener('change', () => {
            saveCurrentRoomData(); // Save immediately when options change
            updateCostBreakdown();
        });
    });

    // Additional options listeners
    document.getElementById('tax-type').addEventListener('change', updateCostBreakdown);
    document.getElementById('installation-type').addEventListener('change', updateCostBreakdown);
    document.getElementById('installation-surcharge').addEventListener('input', updateCostBreakdown);
    document.getElementById('discount').addEventListener('input', updateCostBreakdown);
	
}

// Wall Management Functions
function addWall(section) {
    const wallsContainer = document.getElementById(`${section}-walls`);
    const wallCount = wallsContainer.getElementsByClassName('form-group').length;
    
    if (wallCount < 4) {
        const wallLetter = String.fromCharCode(65 + wallCount); // A=65, B=66, etc.
        const newWall = document.createElement('div');
        newWall.className = 'form-group';
        newWall.innerHTML = `
            <label for="${section}-wall-${wallLetter.toLowerCase()}">Wall ${wallLetter}:</label>
            <input type="number" 
                   id="${section}-wall-${wallLetter.toLowerCase()}" 
                   name="${section}-wall-${wallLetter.toLowerCase()}" 
                   step="0.01" 
                   
                   onchange="updateLinearFootage()">
            ${wallCount < 3 ? `<button type="button" class="add-wall-button small" onclick="addWall('${section}')">+</button>` : ''}
        `;
        wallsContainer.appendChild(newWall);
        updateLinearFootage();
    }
}

function updateLinearFootage() {
    const baseWalls = document.querySelectorAll('#base-walls input[type="number"]');
    const upperWalls = document.querySelectorAll('#upper-walls input[type="number"]');
    
    if (!baseWalls.length || !upperWalls.length) {
        console.error('Wall measurement inputs not found');
        return;
    }
    let baseTotal = 0;
    baseWalls.forEach(input => {
        baseTotal += parseFloat(input.value) || 0;
    });
    const baseLinearFoot = baseTotal / 12;
    document.getElementById('base-linear-foot-value').textContent = baseLinearFoot.toFixed(2);

    let upperTotal = 0;
    upperWalls.forEach(input => {
        upperTotal += parseFloat(input.value) || 0;
    });
    const upperLinearFoot = upperTotal / 12;
    document.getElementById('upper-linear-foot-value').textContent = upperLinearFoot.toFixed(2);

    // Trigger cost breakdown update
    updateCostBreakdown();
}


// Add this to your existing code
function getRoomData(roomId) {
    return {
        dimensions: {
            base: {
                wallA: document.getElementById('base-wall-a').value || '',
                wallB: document.getElementById('base-wall-b').value || '',
                wallC: document.getElementById('base-wall-c').value || '',
                wallD: document.getElementById('base-wall-d').value || ''
            },
            upper: {
                wallA: document.getElementById('upper-wall-a').value || '',
                wallB: document.getElementById('upper-wall-b').value || '',
                wallC: document.getElementById('upper-wall-c').value || '',
                wallD: document.getElementById('upper-wall-d').value || ''
            }
        },
        options: {
            "Box Construction": document.getElementById('box-construction').value,
            "Box Material": document.getElementById('box-material').value,
            "Door Material": document.getElementById('door-material').value,
            "Door Style": document.getElementById('door-style').value,
            "Finish": document.getElementById('finish').value,
            "Interior Finish": document.getElementById('interior-finish').value,
            "Drawer Box": document.getElementById('drawer-box').value,
            "Drawer Style": document.getElementById('drawer-style').value,
            "Hardware": document.getElementById('hardware').value,
            "Edgeband": document.getElementById('edgeband').value
        }
    };
}

// Utility Functions
function generateQuoteId() {
    currentQuoteId++;
    localStorage.setItem('lastQuoteId', currentQuoteId);
    return `Q${String(currentQuoteId).padStart(4, '0')}`;
}

function getWallMeasurements(section) {
    const walls = document.getElementById(`${section}-walls`).getElementsByTagName('input');
    return Array.from(walls).map(input => parseFloat(input.value) || 0);
}

function showNotification(message, type) {
    const statusDiv = document.getElementById('submission-status');
    statusDiv.className = `submission-status ${type}`;
    statusDiv.textContent = message;
    statusDiv.style.display = 'block';
    setTimeout(() => {
        statusDiv.style.display = 'none';
    }, 5000);
}

// CabinetCalculator Class and Cost Calculations

class CabinetCalculator {
    constructor(linearFootage) {
        this.linearFootage = linearFootage;
        
        // Bind methods to preserve 'this' context
        this.boxConstruction = this.boxConstruction.bind(this);
        this.boxMaterial = this.boxMaterial.bind(this);
        this.doorMaterial = this.doorMaterial.bind(this);
        this.doorStyle = this.doorStyle.bind(this);
        this.finish = this.finish.bind(this);
        this.interiorFinish = this.interiorFinish.bind(this);
        this.drawerBox = this.drawerBox.bind(this);
        this.drawerStyle = this.drawerStyle.bind(this);
        this.hardware = this.hardware.bind(this);
        this.edgeband = this.edgeband.bind(this);

        this.components = {
            "Box Construction": this.boxConstruction,
            "Box Material": this.boxMaterial,
            "Door Material": this.doorMaterial,
            "Door Style": this.doorStyle,
            "Finish": this.finish,
            "Interior Finish": this.interiorFinish,
            "Drawer Box": this.drawerBox,
            "Drawer Style": this.drawerStyle,
            "Hardware": this.hardware,
            "Edgeband": this.edgeband
        };

        // Define costs for all components
        this.costs = {
            "Box Construction": {
                "Inset": 600,
                "Overlay": 410,
                "Framed": 480
            },
            "Box Material": {
                "MDF": 0,
                "White Birch": 0,
                "White Rift Oak": 65,
                "Hickory": 65,
                "Cherry": 50,
                "Mahogany": 80,
                "Cedar": 20,
                "White Oak": 25
            },
            "Door Material": {
                "Maple": 0,
                "White Rift Oak": 65,
                "Hickory": 65,
                "Cherry": 50,
                "Mahogany": 80,
                "Cedar": 20,
                "White Oak": 25,
                "Walnut": 80,
                "Laminate": 0
            },
            "Door Style": {
                "Basic Shaker": 0,
                "Flat Panel": 0,
                "Shaker w/ Moulding": 10,
                "Raised Shaker": 25,
                "Flat Panel High Gloss Laminate": 75
            },
            "Finish": {
                "Basic Stain": 0,
                "Basic Paint": 0,
                "Glaze": 55,
                "Color Match Stain": 30,
                "Color Match Paint": 30,
                "Distressed": 55,
                "Laminate": 0
            },
            "Interior Finish": {
                "White Birch": 0,
                "Stain": 60,
                "Paint": 60,
                "Glaze": 110,
                "Distressed": 110,
                "Laminate": 0,
                "MDF": 0
            },
            "Drawer Box": {
                "Dovetail": 0.05,
                "Rabbet": 0.0
            },
            "Drawer Style": {
                "Basic Shaker": 0,
                "Flat Panel": 0,
                "Shaker w/ Moulding": 0,
                "Raised Shaker": 0,
                "Flat Panel High Gloss Laminate": 0
            },
        "Hardware": { "None": 0 }, // Add Hardware cost
        "Edgeband": { "None": 0 } // Add Edgeband cost
    };
    }

    // Component cost calculation methods
    boxConstruction(option) {
        return this.costs["Box Construction"][option] * this.linearFootage;
    }

    boxMaterial(option) {
        return this.costs["Box Material"][option] * this.linearFootage;
    }

    doorMaterial(option) {
        return this.costs["Door Material"][option] * this.linearFootage;
    }

    doorStyle(option) {
        return this.costs["Door Style"][option] * this.linearFootage;
    }

    finish(option) {
        return this.costs["Finish"][option] * this.linearFootage;
    }

    interiorFinish(option) {
        return this.costs["Interior Finish"][option] * this.linearFootage;
    }

    drawerBox(option) {
        const boxConstructionCost = this.boxConstruction(document.getElementById('box-construction').value);
        return this.costs["Drawer Box"][option] * boxConstructionCost;
    }

    drawerStyle(option) {
        return this.costs["Drawer Style"][option] * this.linearFootage;
    }

    hardware(option) {
        return 0; // Hardware is input only, no cost
    }

    edgeband(option) {
        return 0; // Edgeband is input only, no cost
    }

    // Add debug logging to your calculateTotalCost method
calculateTotalCost(selections) {
    console.log('Calculating total cost with selections:', selections);
    let totalCost = 0;
    for (let component in selections) {
        if (this.components[component] && selections[component]) {
            console.log(`Calculating cost for ${component}: ${selections[component]}`);
            let cost = this.components[component](selections[component]);
            console.log(`Cost for ${component}: ${cost}`);
            totalCost += cost;
        }
    }
    console.log('Total cost:', totalCost);
    return totalCost;
  }
}

// Cost Breakdown Update Function
function updateCostBreakdown() {
    try {
        const costBreakdownList = document.getElementById('cost-breakdown-list');
        if (!costBreakdownList) {
            console.error('Cost breakdown list element not found');
            return;
        }

        costBreakdownList.innerHTML = ''; // Clear previous breakdown

        let projectSubtotal = 0;
        let totalInstallationCost = 0;

        rooms.forEach((roomName, index) => {
            const roomId = `room-${index + 1}`;
            const savedData = localStorage.getItem(roomId);
            const roomData = savedData ? JSON.parse(savedData) : {
                dimensions: { base: {}, upper: {} },
                options: {},
                addons: [] // Initialize addons here as well
            };

            // Get room measurements
            const baseWalls = roomData.dimensions?.base || {};
            const upperWalls = roomData.dimensions?.upper || {};
            const baseLinearFoot = Object.values(baseWalls).reduce((sum, value) => sum + (parseFloat(value) || 0), 0) / 12;
            const upperLinearFoot = Object.values(upperWalls).reduce((sum, value) => sum + (parseFloat(value) || 0), 0) / 12;
            const totalLinearFoot = baseLinearFoot + upperLinearFoot;

            // Get room selections
            const selections = { ...roomData.options }; // Use spread operator
            console.log('Room selections:', selections);

            // Calculate room cost
            const calculator = new CabinetCalculator(totalLinearFoot);
            let roomSubtotal = calculator.calculateTotalCost(selections);
            console.log('Room subtotal:', roomSubtotal);

            // Add-ons for this room
            const roomAddons = getRoomAddons(roomId);
            const roomAddonsCost = calculateRoomAddonsCost(roomId);
            roomSubtotal += roomAddonsCost; // Add to room subtotal

            // Create room section
            const roomSection = document.createElement('div');
            roomSection.className = 'room-section';

            // Room header
            const roomHeader = document.createElement('div');
            roomHeader.className = 'cost-line room-header';
            roomHeader.innerHTML = `
                <span>${roomName}</span>
                <span class="amount">${formatMoney(roomSubtotal)}</span>
            `;
            roomSection.appendChild(roomHeader);

            // Room details (options and add-ons)
            for (let [component, value] of Object.entries(selections)) {
        if (value && value.trim() !== '' && value !== '-') {
            const selectionItem = document.createElement('div');
            selectionItem.className = 'cost-line selection-detail';
            selectionItem.innerHTML = `
                <span>-${component}:</span>
                <span>${value}</span>
            `;
            roomSection.appendChild(selectionItem);
        }
    }

            roomAddons.forEach(addonData => {
                const addonItem = document.createElement('div');
                addonItem.className = 'cost-line selection-detail';
                addonItem.innerHTML = `
                    <span>- ${addonData.name}:</span>
                    <span>${addonData.value} ${addonData.unit}</span>
                `;
                roomSection.appendChild(addonItem); // Append directly to roomSection
            });

            costBreakdownList.appendChild(roomSection);

            projectSubtotal += roomSubtotal; // Update project subtotal

            // Calculate installation cost for this room
            const installationType = document.getElementById('installation-type').value;
            if (installationType === 'professional' && selections["Box Construction"]) {
                const roomInstallationCost = calculateInstallationCost(selections["Box Construction"], totalLinearFoot);
                totalInstallationCost += roomInstallationCost;
            }
        });


        // Get project-wide options
        const taxType = document.getElementById('tax-type').value;
    const taxRate = taxType === 'AZ' ? 0.086 : 0;
    const installationType = document.getElementById('installation-type').value;
    const installationSurcharge = parseFloat(document.getElementById('installation-surcharge').value) || 0;
    const discount = parseFloat(document.getElementById('discount').value) || 0;
	
	if (installationType === 'professional') {
            totalInstallationCost += installationSurcharge;
        }

        // Calculate project totals (addonsCost already included in projectSubtotal)
        const discountedSubtotal = projectSubtotal - discount;
        const tax = discountedSubtotal * taxRate;
        const total = discountedSubtotal + tax + totalInstallationCost;

        /// Create summary section
        const summarySection = document.createElement('div');
        summarySection.className = 'project-summary';

        // Project subtotal
        const subtotalElement = document.createElement('div');
        subtotalElement.className = 'cost-line subtotal';
        subtotalElement.innerHTML = `
            <span>Project Sub-Total</span>
            <span class="amount">${formatMoney(projectSubtotal)}</span>
        `;
        summarySection.appendChild(subtotalElement);

// Discount if applicable
    if (discount > 0) {
        const discountLine = document.createElement('div');
        discountLine.className = 'cost-line';
        discountLine.innerHTML = `
            <span>Discount</span>
            <span class="amount">-${formatMoney(discount)}</span>
        `;
        summarySection.appendChild(discountLine);
    }

// Tax line
    const taxLine = document.createElement('div');
    taxLine.className = 'cost-line';
    taxLine.innerHTML = taxType === 'AZ' ? `
        <span>Tax (8.6%)</span>
        <span class="amount">${formatMoney(tax)}</span>
    ` : `
        <span>Tax-Exempt</span>
        <span class="amount">${formatMoney(0)}</span>
    `;
    summarySection.appendChild(taxLine);

    // Installation line
    const installationLine = document.createElement('div');
    installationLine.className = 'cost-line';
    installationLine.innerHTML = installationType === 'professional' ? `
        <span>Installation${installationSurcharge > 0 ? ' (+Surcharge)' : ''}</span>
        <span class="amount">${formatMoney(totalInstallationCost)}</span>
    ` : `
        <span>Self-Install</span>
        <span class="amount">${formatMoney(0)}</span>
    `;
    summarySection.appendChild(installationLine);

    // Project total
    const totalLine = document.createElement('div');
    totalLine.className = 'cost-line total';
    totalLine.innerHTML = `
        <span>Project Total</span>
        <span class="amount">${formatMoney(total)}</span>
    `;
    summarySection.appendChild(totalLine);

    // Add summary section to cost breakdown
    costBreakdownList.appendChild(summarySection);

} catch (error) {
        console.error('Error updating cost breakdown:', error);
        showNotification('Error calculating costs', 'error');
    }
}

// Installation cost calculation
function calculateInstallationCost(boxConstruction, totalLinearFoot) {
    const baseRate = boxConstruction === "Inset" ? 600 :
                    boxConstruction === "Overlay" ? 410 :
                    boxConstruction === "Framed" ? 480 : 0;
    return baseRate * totalLinearFoot * 0.1; // 10% of box construction cost
}

function calculateRoomLinearFootage(roomData) {
    if (!roomData || !roomData.dimensions) return 0;

    const baseWalls = roomData.dimensions.base || {};
    const upperWalls = roomData.dimensions.upper || {};
    
    const baseLinearFoot = Object.values(baseWalls).reduce((sum, value) => 
        sum + (parseFloat(value) || 0), 0) / 12;
    const upperLinearFoot = Object.values(upperWalls).reduce((sum, value) => 
        sum + (parseFloat(value) || 0), 0) / 12;
    
    return baseLinearFoot + upperLinearFoot;
}

function initializeRoomSelector() {
    const selector = document.getElementById('room-selector');
    selector.innerHTML = ''; // Clear existing options

    rooms.forEach((room, index) => {
        const option = document.createElement('option');
        option.value = `room-${index + 1}`; // Use room-1, room-2, etc. as values
        option.textContent = room; // Display actual room name
        selector.appendChild(option);
    });

    // Set the initial room name input value
    const firstRoomName = rooms[0];
    document.getElementById('room-name').value = firstRoomName;
}

function editRoomName(roomNumber) {
    // Hide the name span and show the input
    document.getElementById(`room-name-${roomNumber}`).style.display = 'none';
    document.getElementById(`edit-room-name-${roomNumber}`).style.display = 'inline-block';
    document.getElementById(`edit-room-name-${roomNumber}`).focus(); // Focus on input field
    
    // Hide edit button and show save button
    const editButton = document.querySelector(`#room-name-${roomNumber}`).nextElementSibling.nextElementSibling;
    const saveButton = editButton.nextElementSibling;
    
    editButton.style.display = 'none';
    saveButton.style.display = 'inline-block'; // This is the key change

    // Add event listener for Enter key
    const input = document.getElementById(`edit-room-name-${roomNumber}`);
    input.addEventListener('keypress', function(e) {
        if (e.key === 'Enter') {
            saveRoomName(roomNumber);
        }
    });
}

function saveRoomName(roomNumber) {
    const newRoomName = document.getElementById(`edit-room-name-${roomNumber}`).value;
    if (!newRoomName.trim()) {
        alert('Room name cannot be empty');
        return;
    }

    // Update room name
    document.getElementById(`room-name-${roomNumber}`).textContent = newRoomName;
    rooms[roomNumber - 1] = newRoomName;
    localStorage.setItem('rooms', JSON.stringify(rooms));
    
    // Update display
    document.getElementById(`room-name-${roomNumber}`).style.display = 'inline-block';
    document.getElementById(`edit-room-name-${roomNumber}`).style.display = 'none';
    
    // Toggle button visibility
    const editButton = document.querySelector(`#room-name-${roomNumber}`).nextElementSibling.nextElementSibling;
    const saveButton = editButton.nextElementSibling;
    
    editButton.style.display = 'inline-block';
    saveButton.style.display = 'none';

    // Update room selector dropdown
    initializeRoomSelector();
    
    // Save the current room data
    saveCurrentRoomData();
}

function updateRoomList() {
    const roomList = document.querySelector('.room-list');
    roomList.innerHTML = '';
    rooms.forEach((room, index) => {
        const roomItem = document.createElement('div');
        roomItem.className = 'room-item';
        roomItem.innerHTML = `
            <span id="room-name-${index + 1}">${room}</span>
            <input type="text" id="edit-room-name-${index + 1}" style="display:none;" value="${room}">
            <button class="edit-room" onclick="editRoomName(${index + 1})">Edit</button>
            <button class="save-room" onclick="saveRoomName(${index + 1})" style="display:none;">Save</button>
            <button class="delete-room" onclick="deleteRoom(${index})" ${rooms.length === 1 ? 'disabled' : ''}>Delete</button>
        `;
        roomList.appendChild(roomItem);
    });
}

function addNewRoom() {
    // First save the current room's data
    saveCurrentRoomData();

    const nextRoomNumber = rooms.length + 1;
    const defaultRoomName = `Room ${nextRoomNumber}`;
    const newRoomId = `room-${nextRoomNumber}`;

    rooms.push(defaultRoomName);
    localStorage.setItem('rooms', JSON.stringify(rooms));

    // Initialize empty data structure for new room
const emptyRoomData = {
    dimensions: {
        base: { wallA: '', wallB: '', wallC: '', wallD: '' },
        upper: { wallA: '', wallB: '', wallC: '', wallD: '' }
    },
    options: {
        "Box Construction": '-',
        "Box Material": '-',
        "Door Material": '-',
        "Door Style": '-',
        "Finish": '-',
        "Interior Finish": '-',
        "Drawer Box": '-',
        "Drawer Style": '-',
        "Hardware": '',
        "Edgeband": ''
    }
};

    // Save empty data for new room
    localStorage.setItem(newRoomId, JSON.stringify(emptyRoomData));

    // Update UI
    updateRoomList();
    initializeRoomSelector();

    // Stay on current room and maintain its data
    document.getElementById('room-selector').value = currentRoomId;
    document.getElementById('room-name').value = rooms[parseInt(currentRoomId.replace('room-', '')) - 1];

    console.log('Added new room:', newRoomId, 'staying on current room:', currentRoomId);
    
    // Just update the calculations
    updateLinearFootage();
    updateCostBreakdown();
}


document.getElementById('room-selector').addEventListener('change', function(e) {
    const previousRoom = currentRoomId;
    const newRoom = e.target.value;
    
    console.log('Switching rooms:', { from: previousRoom, to: newRoom });
    
    // Save current room data with current form state
    const currentRoomData = {
        dimensions: {
            base: {
                wallA: document.getElementById('base-wall-a').value || '',
                wallB: document.getElementById('base-wall-b').value || '',
                wallC: document.getElementById('base-wall-c').value || '',
                wallD: document.getElementById('base-wall-d').value || ''
            },
            upper: {
                wallA: document.getElementById('upper-wall-a').value || '',
                wallB: document.getElementById('upper-wall-b').value || '',
                wallC: document.getElementById('upper-wall-c').value || '',
                wallD: document.getElementById('upper-wall-d').value || ''
            }
        },
        options: getSelectedOptions()
    };
    
    console.log('Saving current room state:', currentRoomData);
    localStorage.setItem(previousRoom, JSON.stringify(currentRoomData));
    
    // Update current room tracker
    currentRoomId = newRoom;
    
    // Load new room data
    loadRoomData(newRoom);
});

document.getElementById('manage-rooms-button').onclick = function() {
    updateRoomList();
    modal.style.display = "block";
}

function deleteRoom(index) {
    if (rooms.length > 1) {
        const deletedRoomName = rooms[index];
        rooms.splice(index, 1); // Remove room at specific index
        localStorage.setItem('rooms', JSON.stringify(rooms));
        localStorage.removeItem(`room-${deletedRoomName.toLowerCase().replace(/\s+/g, '-')}`);

        // Update room list and selector
        updateRoomList();
        initializeRoomSelector();

        // Switch to the first room if the deleted room was selected
        const currentRoomValue = document.getElementById('room-selector').value;
        if (currentRoomValue === `room-${index + 1}`) {
            document.getElementById('room-selector').value = 'room-1';
            loadRoomData('room-1');
        }

        // Rename remaining rooms if necessary
        const updatedRooms = rooms.map((room, i) => {
            const roomNumberMatch = room.match(/^Room (\d+)$/);
            if (roomNumberMatch) {
                return `Room ${i + 1}`;
            }
            return room;
        });
        rooms = updatedRooms;
        localStorage.setItem('rooms', JSON.stringify(rooms));
        initializeRoomSelector();
    }
}

function showDialog(dialogId) {
    const dialog = document.getElementById(dialogId);
    if (dialog) {
        dialog.style.display = 'block';
    }
}

function calculateLinearFootage(dimensions) {
    let total = 0;
    Object.values(dimensions).forEach(value => {
        total += parseFloat(value) || 0;
    });
    return total / 12; // Convert to linear feet
}

// Data Management Functions
function saveCurrentRoomData(roomId = currentRoomId) {
    console.log('Saving data for:', roomId);

    const roomAddons = getRoomAddons(roomId);

    const roomData = {
        dimensions: {
            base: {
                wallA: document.getElementById('base-wall-a').value || '',
                wallB: document.getElementById('base-wall-b').value || '',
                wallC: document.getElementById('base-wall-c').value || '',
                wallD: document.getElementById('base-wall-d').value || ''
            },
            upper: {
                wallA: document.getElementById('upper-wall-a').value || '',
                wallB: document.getElementById('upper-wall-b').value || '',
                wallC: document.getElementById('upper-wall-c').value || '',
                wallD: document.getElementById('upper-wall-d').value || ''
            }
        },
        options: getSelectedOptions(),
        addons: roomAddons.map(addon => ({
            key: addon.key,
            value: addon.value,
            linearFeet: addon.type === 'linear' ? addon.value : undefined
        }))
    }; // roomData object is now complete

    console.log('Room data to save:', roomData);

    try {
        localStorage.setItem(roomId, JSON.stringify(roomData));
        console.log('Successfully saved room data');
    } catch (error) {
        console.error('Error saving room data:', error);
    }

    return roomData;
}


function setWallDimensions(section, dimensions) {
    Object.entries(dimensions).forEach(([wall, value]) => {
        const input = document.getElementById(`${section}-wall-${wall.toLowerCase()}`);
        if (input) input.value = value;
    });
}

function getSelectedOptions() {
    const options = {
        "Box Construction": document.getElementById('box-construction').value,
        "Box Material": document.getElementById('box-material').value,
        "Door Material": document.getElementById('door-material').value,
        "Door Style": document.getElementById('door-style').value,
        "Finish": document.getElementById('finish').value,
        "Interior Finish": document.getElementById('interior-finish').value,
        "Drawer Box": document.getElementById('drawer-box').value,
        "Drawer Style": document.getElementById('drawer-style').value,
        "Hardware": document.getElementById('hardware').value,
        "Edgeband": document.getElementById('edgeband').value
    };

    console.log('Getting selected options:', options);
    return options;
}

function setWallMeasurements(section, measurements) {
    const container = document.getElementById(`${section}-walls`);
    if (!container) return;

    // Clear existing wall inputs
    const inputs = container.querySelectorAll('input');
    inputs.forEach(input => input.value = '');


    // Then, populate with provided measurements (if any)
    measurements.forEach((measurement, index) => {
        const wallLetter = String.fromCharCode(65 + index);
        const input = document.getElementById(`${section}-wall-${wallLetter.toLowerCase()}`);
        if (input) {
            input.value = measurement;
        }
    });
}

// Save and Back Button Handling
function saveQuote() {
    const modal = document.getElementById('saveQuoteModal');
    if (modal) {
        modal.style.display = 'block';
    }
}

// New function to cancel save operation
function cancelSaveQuote() {
    const modal = document.getElementById('saveQuoteModal');
    if (modal) {
        modal.style.display = 'none';
        document.getElementById('project-name').value = '';
    }
}

function clearData() {
    // 1. Reset rooms array and localStorage
    rooms = ['Room 1'];
    localStorage.setItem('rooms', JSON.stringify(rooms));

    // 2. Clear all room data in localStorage
    for (let i = 1; i <= 10; i++) {
        localStorage.removeItem(`room-${i}`); // Correct key format
    }

    // 3. Reset form fields
    document.getElementById('room-name').value = 'Room 1';
    const baseWalls = document.querySelectorAll('#base-walls input');
    const upperWalls = document.querySelectorAll('#upper-walls input');
    baseWalls.forEach(input => input.value = '');
    upperWalls.forEach(input => input.value = '');

    const options = document.querySelectorAll('.options-form select, .options-form input');
    options.forEach(option => {
        if (option.tagName === 'SELECT') {
            option.selectedIndex = 0; // Reset select to default option
        } else {
            option.value = ''; // Clear input fields
        }
    });

    // 4. Reset additional options
    document.getElementById('tax-type').selectedIndex = 0;
    document.getElementById('installation-type').selectedIndex = 0;
    document.getElementById('installation-surcharge').value = '0.00';
    document.getElementById('discount').value = '0.00';

// Clear active add-ons
    const activeAddons = document.getElementById('active-addons');
    if (activeAddons) {
        activeAddons.innerHTML = '';
    }

    // 5. Update UI
    initializeRoomSelector();
    updateLinearFootage();
    updateCostBreakdown();
    closeModal(); // Close the modal after clearing data
}


function handleBack() {
    const hasChanges = checkForUnsavedChanges();
    if (hasChanges) {
        showBackConfirmation();
    } else {
        goToMainMenu();
    }
}

function checkForUnsavedChanges() {
    const currentState = {
        rooms: rooms.map(room => ({
            name: room,
            data: JSON.parse(localStorage.getItem(`room-${room.toLowerCase().replace(/\s+/g, '-')}`))
        }))
    };

    const lastSavedState = JSON.parse(localStorage.getItem('lastSavedState') || '{}');
    return JSON.stringify(currentState) !== JSON.stringify(lastSavedState);
}

function updateLastSavedState() {
    const currentState = {
        rooms: rooms.map(room => ({
            name: room,
            data: JSON.parse(localStorage.getItem(`room-${room.toLowerCase().replace(/\s+/g, '-')}`))
        }))
    };
    localStorage.setItem('lastSavedState', JSON.stringify(currentState));
}

// Back confirmation modal handlers
function showBackConfirmation() {
    document.getElementById('backConfirmationModal').style.display = 'block';
}

function hideBackConfirmation() {
    document.getElementById('backConfirmationModal').style.display = 'none';
}
async function saveAndExit() {
    try {
        await saveQuote();
        goToMainMenu();
    } catch (error) {
        console.error('Error saving quote:', error);
        showNotification('Error saving quote before exit', 'error');
    }
}

function discardAndExit() {
    hideBackConfirmation();
    goToMainMenu();
}

function cancelExit() {
    hideBackConfirmation();
}

// Function to show the confirmation modal
function showClearConfirmation() {
    document.getElementById('clearConfirmationModal').style.display = 'block';
}

// Function to handle confirmation
function confirmClearData() {
    clearData(); // Call your existing clearData function
    document.getElementById('clearConfirmationModal').style.display = 'none'; // Close modal
}

// Function to handle cancellation
function cancelClearData() {
    document.getElementById('clearConfirmationModal').style.display = 'none'; // Close modal
}

// Define optionMapping at the top level, outside any function
const optionMapping = {
    'boxConstruction': 'box-construction',
    'boxMaterial': 'box-material',
    'doorMaterial': 'door-material',
    'doorStyle': 'door-style',
    'finish': 'finish',
    'interiorFinish': 'interior-finish',
    'drawerBox': 'drawer-box',
    'drawerStyle': 'drawer-style',
    'hardware': 'hardware',
    'edgeband': 'edgeband'
};

function setSelectedOptions(options = {}) {
    console.log('Setting options:', options);

    // Get all select elements in the options form
    const selects = document.querySelectorAll('.options-form select');

    // Reset all selects first
    selects.forEach(select => {
        select.value = select.options[0].value; // Set to first option (usually empty or default)
    });

    // Reset all text inputs
    const inputs = document.querySelectorAll('.options-form input[type="text"]');
    inputs.forEach(input => {
        input.value = '';
    });

    // Set the values for each option
    if (options) {
        Object.entries(options).forEach(([key, value]) => {
            if (value && value !== '-') {
                const elementId = optionMapping[key] || key;
                const element = document.getElementById(elementId);
                if (element) {
                    if (element.tagName === 'SELECT') {
                        // Check if the value is a valid option for select elements
                        if (Array.from(element.options).some(option => option.value === value)) {
                            element.value = value;
                            console.log(`Set ${elementId} to ${value}`);
                        } else {
                            console.warn(`Invalid option value "${value}" for select element "${elementId}". Setting to default.`);
                            element.value = '-'; // Set to default if invalid
                        }
                    } else { // For input elements, just set the value
                        element.value = value;
                        console.log(`Set ${elementId} to ${value}`);
                    }
                } else {
                    console.warn(`Element with ID "${elementId}" not found.`);
                }
            }
        });
    }
}

const ADDONS = {
    baseInteriorLighting: {
        name: "Base Interior Cabinet Lighting",
        price: 9.375,
        type: "linear",
        unit: "linear ft."
    },
    toeKickLighting: {
        name: "Toe-Kick Lighting",
        price: 9.375,
        type: "linear",
        unit: "linear ft."
    },
    drawerCharging: {
        name: "Drawer Hidden Charging Station",
        price: 635.00,
        type: "quantity",
        unit: "quantity"
    },
    trashPulloutSoft: {
        name: "Base Trash Pullout w/ Soft Close",
        price: 550.00,
        type: "quantity",
        unit: "quantity"
    },
    trashPulloutBasic: {
        name: "Basic Trash Pullout",
        price: 300.00,
        type: "quantity",
        unit: "quantity"
    },
    underCabinetLighting: {
        name: "Under-Cabinet Lighting",
        price: 9.375,
        type: "linear",
        unit: "linear ft."
    },
    upperInteriorLighting: {
        name: "Upper Interior Cabinet Lighting",
        price: 9.375,
        type: "linear",
        unit: "linear ft."
    },
    floatingShelves: {
        name: "Floating Shelves",
        price: 50.00,
        type: "linear",
        unit: "per linear foot"
    },
    floatingShelvesLED: {
        name: "Floating Shelves + LED Lighting",
        price: 60.00,
        type: "linear",
        unit: "linear foot"
    },
    upperPulloutRack: {
        name: "Upper 4-Shelf Pullout Rack w/ Soft Close",
        price: 300.00,
        type: "quantity",
        unit: "quantity"
    }
};

// Initialize add-ons select
function initializeAddons() {
    console.log('Initializing add-ons...');
    const select = document.getElementById('addon-select');
    console.log('Add-on select element:', select);
    
    if (!select) {
        console.error('Add-on select element not found!');
        return;
    }

    Object.entries(ADDONS).forEach(([key, addon]) => {
        console.log('Adding addon:', key, addon);
        const option = document.createElement('option');
        option.value = key;
        option.textContent = addon.name; // Just show the name, not the price
        select.appendChild(option);
    });
    
    console.log('Add-ons initialized');
}

// Add selected add-on
function addSelectedAddon() {
    const select = document.getElementById('addon-select');
    const addonKey = select.value;

    if (!addonKey) return;

    const addon = ADDONS[addonKey];
    
    // Get the container for the current room's add-ons
    let roomAddonsContainer = document.getElementById(`room-addons-${currentRoomId}`);
    if (!roomAddonsContainer) {
        roomAddonsContainer = document.createElement('div');
        roomAddonsContainer.id = `room-addons-${currentRoomId}`;
        roomAddonsContainer.className = 'active-addons'; // Use the same class as the main add-ons container
        
        // Insert the container after the addon-section
        const addonSection = document.querySelector('.addon-section');
        if (addonSection) {
            addonSection.appendChild(roomAddonsContainer);
        } else {
            console.error('Could not find addon-section to append add-ons container');
            return; // Or handle the error as needed
        }
    }

    // Check if add-on already exists for this room
    const existingAddon = roomAddonsContainer.querySelector(`.addon-item[data-addon-key="${addonKey}"]`);
    if (existingAddon) {
        alert(`This add-on already exists for ${rooms[parseInt(currentRoomId.replace('room-', '')) - 1]}`);
        return;
    }

    // Create addon item
    const addonItem = document.createElement('div');
    addonItem.className = 'addon-item';
    addonItem.dataset.addonKey = addonKey;
    addonItem.dataset.roomId = currentRoomId; // Associate with room
    addonItem.dataset.addonName = addon.name;
    addonItem.dataset.addonPrice = addon.price;
    addonItem.dataset.addonType = addon.type;
    addonItem.dataset.addonUnit = addon.unit;

    const inputType = addon.type === 'linear' ? 'number' : 'number';
    const inputStep = addon.type === 'linear' ? '0.01' : '1';
    const inputMin = addon.type === 'linear' ? '0' : '1';
    const defaultValue = addon.type === 'linear' ? '' : '1';

    addonItem.innerHTML = `
        <span>${addon.name}</span>
        <input type="${inputType}" 
               step="${inputStep}" 
               min="${inputMin}" 
               value="${defaultValue}" 
               class="addon-value" 
               onchange="updateAddonTotal(this)"
               ${addon.type === 'quantity' ? 'pattern="[0-9]*"' : ''}
               maxlength="3">
        <span>${addon.unit}</span>
        <span class="addon-total">${formatMoney(0)}</span>
        <button class="remove-addon" onclick="removeAddon(this)">×</button>
    `;

    roomAddonsContainer.appendChild(addonItem); // Append to the room's container
    select.value = ''; // Reset select
    updateAddonTotal(addonItem.querySelector('.addon-value'));
    updateCostBreakdown();
}

// Update addon total

function updateAddonTotal(input) {
    const addonItem = input.closest('.addon-item');
    const addonKey = addonItem.dataset.addonKey;
    const addon = ADDONS[addonKey];
    
    const value = parseFloat(input.value) || 0;
    const total = addon.price * value;
    
    addonItem.querySelector('.addon-total').textContent = formatMoney(total);
    updateCostBreakdown();
}

// Remove addon
function removeAddon(button) {
    const addonItem = button.closest('.addon-item');
    addonItem.remove();
    updateCostBreakdown();
}

// Calculate total addons cost
function calculateAddonsCost() {
    let total = 0;
    document.querySelectorAll('.addon-item').forEach(item => {
        const value = parseFloat(item.querySelector('.addon-value').value) || 0;
        const addon = ADDONS[item.dataset.addonKey];
        total += addon.price * value;
    });
    return total;
}

// Helper functions for add-ons
function getRoomAddons(roomId) {
    const addons = [];
    const addonItems = document.querySelectorAll(`.addon-item[data-room-id="${roomId}"]`);
    addonItems.forEach(item => {
        const addonKey = item.dataset.addonKey;
        const addon = ADDONS[addonKey]; // Get the addon from ADDONS
        const value = parseFloat(item.querySelector('.addon-value').value) || 0;
        if (value > 0) {
            addons.push({
                key: addonKey,
                name: addon.name,
                value: value,
                unit: addon.unit,
                price: addon.price * value,
                type: addon.type // Include the type here
            });
        }
    });
    return addons;
}

function calculateRoomAddonsCost(roomId) {
    return getRoomAddons(roomId).reduce((total, addon) => total + addon.price, 0);
}

// New function to add an add-on to a specific room
function addAddonToRoom(roomId, addon, value, linearFeet, container) {
    const addonItem = document.createElement('div');
    addonItem.className = 'addon-item';
    addonItem.dataset.roomId = roomId; // Associate with room
    addonItem.dataset.addonKey = Object.keys(ADDONS).find(key => ADDONS[key] === addon); // Store addon key
    addonItem.dataset.addonName = addon.name;
    addonItem.dataset.addonPrice = addon.price;
    addonItem.dataset.addonType = addon.type;
    addonItem.dataset.addonUnit = addon.unit;

    const inputType = addon.type === 'linear' ? 'number' : 'number';
    const inputStep = addon.type === 'linear' ? '0.01' : '1';
    const inputMin = addon.type === 'linear' ? 0 : 1;
    const inputValue = addon.type === 'linear' ? linearFeet : value;

    addonItem.innerHTML = `
        <span>${addon.name}</span>
        <input type="${inputType}"
               step="${inputStep}"
               min="${inputMin}"
               value="${inputValue}"
               class="addon-value"
               onchange="updateAddonTotal(this)"
               ${addon.type === 'quantity' ? 'pattern="[0-9]*"' : ''}
               maxlength="3">
        <span>${addon.unit}</span>
        <span class="addon-total">${formatMoney(addon.price * inputValue)}</span>
        <button class="remove-addon" onclick="removeAddon(this)">×</button>
    `;

    container.appendChild(addonItem); // Append to the specified container
    updateAddonTotal(addonItem.querySelector('.addon-value'));
    updateCostBreakdown();
}

// Helper function to get all add-ons
function getAddons() {
    const addons = [];
    rooms.forEach((roomName, index) => {  // Iterate through each room
        const roomId = `room-${index + 1}`;
        const roomAddons = getRoomAddons(roomId); // Get add-ons for this room
        addons.push(...roomAddons); // Add the room's add-ons to the main array
    });
    return addons;
}

async function confirmSaveQuote(existingProjectName = null) {
    const projectName = existingProjectName || document.getElementById('project-name').value.trim();
    
    try {
        if (!projectName) {
            showNotification('Please enter a project name', 'error');
            return;
        }

        setLoadingState(true);

            // Gather room data
            const roomsData = rooms.map((room, index) => {
                const roomId = `room-${index + 1}`;
                const savedData = localStorage.getItem(roomId);
                const roomData = savedData ? JSON.parse(savedData) : null;
                
                console.log(`Room ${roomId} data:`, roomData);
                
                return {
                    name: room,
                    data: roomData
                };
            });

            const quoteData = {
                id: document.getElementById('quote-id')?.value || generateQuoteId(),
                projectName: projectName,
                timestamp: new Date().toISOString(),
                rooms: roomsData,
                projectTotal: calculateProjectSubtotal(),
                tax: calculateTax(),
                taxType: document.getElementById('tax-type').value,
                installationType: document.getElementById('installation-type').value,
                installationCost: calculateTotalInstallationCost(),
                installationSurcharge: parseFloat(document.getElementById('installation-surcharge').value) || 0,
                discount: parseFloat(document.getElementById('discount').value) || 0,
                finalTotal: calculateFinalTotal(),
				        addons: getAddons()
            };

            console.log('Sending quote data:', quoteData);

            // Use MessageSystem to send the save request
            const result = await MessageSystem.sendMessage('saveQuote', quoteData);

            if (!result || !result.success) {
                throw new Error(result?.error || 'Failed to save quote');
            }

            // Show appropriate message based on whether it's an update or new quote
        showNotification(
            existingProjectName ? 'Quote updated successfully!' : 'Quote saved successfully!',
            'success'
        );
        
        updateLastSavedState();

        // Only close the modal if we're saving a new quote
        if (!existingProjectName) {
            cancelSaveQuote();
        }

    } catch (error) {
        console.error('Save error:', error);
        showNotification('Error saving quote: ' + error.message, 'error');
    } finally {
        setLoadingState(false);
    }
}

document.addEventListener('DOMContentLoaded', function() {
    // Initialize rooms array
    rooms = ['Room 1'];

    // Initialize default room data for the first room
    const defaultRoomData = {
        dimensions: {
            base: { wallA: '', wallB: '', wallC: '', wallD: '' },
            upper: { wallA: '', wallB: '', wallC: '', wallD: '' }
        },
        options: {
            boxConstruction: '',
            boxMaterial: '',
            doorMaterial: '',
            doorStyle: '',
            finish: '',
            interiorFinish: '',
            drawerBox: '',
            drawerStyle: '',
            hardware: '',
            edgeband: ''
        },
        addons: [] // Initialize addons as an empty array
    };
    localStorage.setItem('room-1', JSON.stringify(defaultRoomData));

    modal = document.getElementById('roomManageModal');
    closeBtn = document.querySelector('#roomManageModal .close');
    currentRoomId = 'room-1';

 // Add event listener to update cost breakdown when add-on value changes
    document.getElementById('active-addons').addEventListener('change', function(event) {
        if (event.target.classList.contains('addon-value')) {
            updateCostBreakdown();
        }
    });

    // Set initial display states
    document.getElementById('welcome-container').style.display = 'block';
    document.getElementById('main-menu-container').style.display = 'none';
    document.getElementById('create-quote-container').style.display = 'none';

    // Add new styles
    const newStyles = `
        .project-name {
            font-weight: bold;
            font-size: 1.1em;
        }

        .quote-date {
            color: #666;
        }

        .quote-details {
            margin: 0.5rem 0;
            font-size: 0.9em;
        }

        #project-name {
            width: 100%;
            padding: 0.5rem;
            margin-bottom: 1rem;
            border: 1px solid #ddd;
            border-radius: 4px;
            font-size: 1rem;
        }

        .quotes-list {
            max-height: 400px;
            overflow-y: auto;
        }
    `;
    const styleSheet = document.createElement("style");
    styleSheet.innerText = newStyles;
    document.head.appendChild(styleSheet);

    // Create the save quote modal
    const saveQuoteModal = document.createElement('div');
    saveQuoteModal.id = 'saveQuoteModal';
    saveQuoteModal.className = 'modal';
    saveQuoteModal.innerHTML = `
        <div class="modal-content">
            <div class="modal-header">
                <h3>Save Quote</h3>
                <span class="close" onclick="cancelSaveQuote()">×</span>
            </div>
            <div class="modal-body">
                <div class="form-group">
                    <label for="project-name">Project Name:</label>
                    <input type="text" id="project-name" required>
                </div>
                <div class="confirmation-buttons">
                    <button class="save-button" onclick="confirmSaveQuote()">Save</button>
                    <button class="cancel" onclick="cancelSaveQuote()">Cancel</button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(saveQuoteModal);

    // Define modal-related functions on window object
    window.saveQuote = function() {
        const existingQuoteId = document.getElementById('quote-id').value;
        const existingProjectName = document.getElementById('project-name').value;

        if (existingQuoteId && existingProjectName) {
            if (confirm(`Overwrite quote "${existingProjectName}" (${existingQuoteId})?`)) {
                confirmSaveQuote(existingProjectName);
            }
        } else {
            const modal = document.getElementById('saveQuoteModal');
            if (modal) {
                modal.style.display = 'block';
            }
        }
    };

    window.cancelSaveQuote = function() {
        const modal = document.getElementById('saveQuoteModal');
        if (modal) {
            modal.style.display = 'none';
            document.getElementById('project-name').value = '';
        }
    };

    // Initialize UI and calculations *after* setting up default data
    initializeRoomSelector();
    initializeEventListeners();
    initializeAddons();
    loadRoomData(currentRoomId); // Load initial room data
    updateLinearFootage(); // Calculate initial linear footage
    updateCostBreakdown(); // Calculate initial cost breakdown

    // Add event listeners *after* elements exist in the DOM
    const activeAddonsContainer = document.getElementById('active-addons');
    if (activeAddonsContainer) {
        activeAddonsContainer.addEventListener('change', function(event) {
            if (event.target.classList.contains('addon-value')) {
                updateCostBreakdown();
            }
        });
    } else {
        console.error("Could not find 'active-addons' element");
    }

    const clearDataButton = document.getElementById('clear-data-button');
    if (clearDataButton) {
        clearDataButton.addEventListener('click', showClearConfirmation);
    }
    document.getElementById('back-button')?.addEventListener('click', handleBack);
    document.getElementById('save-quote')?.addEventListener('click', window.saveQuote);
    document.getElementById('tax-type').addEventListener('change', updateCostBreakdown);
    document.getElementById('installation-type').addEventListener('change', updateCostBreakdown);
    document.getElementById('installation-surcharge').addEventListener('input', updateCostBreakdown);
    document.getElementById('discount').addEventListener('input', updateCostBreakdown);

    // Update window click handler for all modals
    window.onclick = function(event) {
        const saveModal = document.getElementById('saveQuoteModal');
        if (event.target === saveModal) {
            cancelSaveQuote();
        }
        if (event.target === modal) {
            closeModal();
        }
        if (event.target === document.getElementById('backConfirmationModal')) {
            hideBackConfirmation();
        }
        if (event.target === document.getElementById('clearConfirmationModal')) {
            cancelClearData();
        }
    };
});

function closeModal() {
    if (modal) { // Check if modal exists
        modal.style.display = "none";
    }
}

function exportToPDF() {
    const { jsPDF } = window.jspdf;
    const doc = new jsPDF();
    
    // Get existing quote ID and project name
    const quoteId = document.getElementById('quote-id').value || 'NEW_QUOTE';
    const projectName = document.getElementById('project-name').value || 'Untitled';
    
    // Add company logo
    const logoUrl = 'https://static.wixstatic.com/media/daaed2_67c14634bac74c9c937f25b28559d874~mv2.png/v1/crop/x_8,y_0,w_1800,h_1996/fill/w_109,h_122,al_c,q_85,usm_0.66_1.00_0.01,enc_avif,quality_auto/Gentry-Stinson-Logo.png';
    
    // Create header section
    doc.addImage(logoUrl, 'PNG', 15, 15, 30, 30);
    doc.setFontSize(20);
    doc.text('Gentry Stinson', 50, 25);
    doc.setFontSize(12);
    doc.text('Phoenix, Arizona', 50, 35);
    
    // Add quote information
    doc.setFontSize(16);
    doc.text('Cabinet Quote', 15, 60);
    doc.setFontSize(12);
    doc.text(`Quote ID: ${quoteId}`, 15, 70);
    doc.text(`Project: ${projectName}`, 15, 80);
    doc.text(`Date: ${new Date().toLocaleDateString()}`, 15, 90);

    // Add room details
    let yPosition = 110; // Adjusted starting position
    rooms.forEach((roomName, index) => {
        const roomId = `room-${index + 1}`;
        const roomData = JSON.parse(localStorage.getItem(roomId)) || {};
        
        // Room header
        doc.setFontSize(14);
        doc.text(roomName, 15, yPosition);
        yPosition += 10;
        
        // Dimensions
        if (roomData.dimensions) {
            doc.setFontSize(12);
            doc.text('Dimensions:', 20, yPosition);
            yPosition += 10;
            
            // Base walls
            if (roomData.dimensions.base) {
                Object.entries(roomData.dimensions.base).forEach(([wall, value]) => {
                    if (value) {
                        doc.text(`Base ${wall}: ${value}"`, 25, yPosition);
                        yPosition += 7;
                    }
                });
            }
            
            // Upper walls
            if (roomData.dimensions.upper) {
                Object.entries(roomData.dimensions.upper).forEach(([wall, value]) => {
                    if (value) {
                        doc.text(`Upper ${wall}: ${value}"`, 25, yPosition);
                        yPosition += 7;
                    }
                });
            }
        }
        
        // Options
        if (roomData.options) {
            yPosition += 5;
            doc.text('Options:', 20, yPosition);
            yPosition += 10;
            
            Object.entries(roomData.options).forEach(([key, value]) => {
                if (value && value !== '-') {
                    doc.text(`${key}: ${value}`, 25, yPosition);
                    yPosition += 7;
                }
            });
        }
        
        yPosition += 10;
        
// Add-ons for this room
    const roomAddons = getRoomAddons(roomId);
    if (roomAddons.length > 0) {
        yPosition += 5;
        doc.text('Add-ons:', 20, yPosition);
        yPosition += 10;
        roomAddons.forEach(addon => {
            doc.text(`- ${addon.name}: ${addon.value} ${addon.unit}`, 25, yPosition);
            yPosition += 7;
        });
    }

    yPosition += 10;


        // Add new page if needed
        if (yPosition > 270) {
            doc.addPage();
            yPosition = 20;
        }
    });
    
    // Add cost breakdown
    doc.addPage();
    doc.setFontSize(16);
    doc.text('Cost Breakdown', 15, 20);
    
    let costYPosition = 40;
    
    // Project subtotal
    const projectSubtotal = calculateProjectSubtotal();
    doc.setFontSize(12);
    doc.text(`Project Sub-Total: ${formatMoney(projectSubtotal)}`, 15, costYPosition);
    costYPosition += 10;
    
    // Tax
    const taxType = document.getElementById('tax-type').value;
    const taxRate = taxType === 'AZ' ? 0.086 : 0;
    const tax = projectSubtotal * taxRate;
    doc.text(`Tax (${taxRate * 100}%): ${formatMoney(tax)}`, 15, costYPosition);
    costYPosition += 10;
    
    // Installation
    const installationType = document.getElementById('installation-type').value;
    const installationSurcharge = parseFloat(document.getElementById('installation-surcharge').value) || 0;
    const installationCost = calculateTotalInstallationCost();
    doc.text(`Installation: ${formatMoney(installationCost)}`, 15, costYPosition);
    costYPosition += 10;
    
    // Discount
    const discount = parseFloat(document.getElementById('discount').value) || 0;
    if (discount > 0) {
        doc.text(`Discount: -${formatMoney(discount)}`, 15, costYPosition);
        costYPosition += 10;
    }
    
    // Total
    const total = projectSubtotal + tax + installationCost - discount;
    doc.setFontSize(14);
    doc.text(`Total: ${formatMoney(total)}`, 15, costYPosition);
    
    // Add footer
    const pageCount = doc.internal.getNumberOfPages();
    for (let i = 1; i <= pageCount; i++) {
        doc.setPage(i);
        doc.setFontSize(10);
        doc.text(`Page ${i} of ${pageCount}`, doc.internal.pageSize.width - 30, doc.internal.pageSize.height - 10);
    }
    
    // Save the PDF with both quote ID and project name
    const sanitizedProjectName = projectName.replace(/[^a-z0-9]/gi, '_').toLowerCase();
    doc.save(`GS_Cabinet_Quote_${quoteId}_${sanitizedProjectName}.pdf`);
}

// Helper function to calculate project subtotal
function calculateProjectSubtotal() {
    let total = 0;
    rooms.forEach((roomName, index) => {
        const roomId = `room-${index + 1}`;
        const roomData = JSON.parse(localStorage.getItem(roomId)) || {};
        const linearFootage = calculateRoomLinearFootage(roomData); // Calculate linear footage
        const calculator = new CabinetCalculator(linearFootage);
        total += calculator.calculateTotalCost(roomData?.options || {}); // Use optional chaining
    });
    return total;
}

// Helper function to calculate total installation cost
function calculateTotalInstallationCost() {
    let total = 0;
    const installationType = document.getElementById('installation-type').value;
    const installationSurcharge = parseFloat(document.getElementById('installation-surcharge').value) || 0;
    
    if (installationType === 'professional') {
        rooms.forEach((roomName, index) => {
            const roomId = `room-${index + 1}`;
            const savedData = localStorage.getItem(roomId);
            const roomData = savedData ? JSON.parse(savedData) : {};

            // Use optional chaining and provide a default empty object
            const roomOptions = roomData?.options || {};  // Correct usage
            const linearFoot = calculateRoomLinearFootage(roomData);

            // Check for both camelCase and title case property names
            const boxConstruction = roomOptions["Box Construction"] || roomOptions.boxConstruction;
            if (boxConstruction) {
                total += calculateInstallationCost(boxConstruction, linearFoot);
            }
        });
        total += installationSurcharge;
    }
    
    return total;
}

// Frontend JavaScript
async function loadQuote(quoteId) {
    try {
        const quote = await MessageSystem.sendMessage('getQuoteById', { quoteId });

        if (!quote) {
            throw new Error('Quote not found or invalid response from server');
        }

        console.log('Loaded quote:', quote);

        // Load the saved quote data into the form
        loadSavedQuote(quote); // Call the new function

        // Close order history modal
        const orderHistoryModal = document.getElementById('orderHistoryModal');
        if (orderHistoryModal) {
            orderHistoryModal.style.display = 'none';
            orderHistoryModal.remove();
        }

    } catch (error) {
        console.error('Load quote error:', error);
        showNotification('Error loading quote: ' + error.message, 'error');
    }
}

async function loadSavedQuote(quote) {
    console.log('Loading saved quote:', quote);

    // 1. Update rooms array and localStorage
    rooms = quote.rooms.map(room => room.name);
    localStorage.setItem('rooms', JSON.stringify(rooms));

    // Clear existing add-ons (IMPORTANT!)
    const activeAddons = document.getElementById('active-addons');
    if (activeAddons) {
        activeAddons.innerHTML = ''; // Clear existing add-ons
    }

    // Remove any existing room-specific add-on containers
    document.querySelectorAll('[id^="room-addons-"]').forEach(container => {
        container.remove();
    });

    // 2. Process each room and its data/add-ons
    quote.rooms.forEach((room, index) => {
        const roomId = `room-${index + 1}`;
        console.log('Processing room:', room);

        const roomData = {
            dimensions: {
                base: { wallA: '', wallB: '', wallC: '', wallD: '' },
                upper: { wallA: '', wallB: '', wallC: '', wallD: '' }
            },
            options: {
                "Box Construction": '',
                "Box Material": '',
                "Door Material": '',
                doorStyle: '',
                "Finish": '',
                "Interior Finish": '',
                drawerBox: '',
                drawerStyle: '',
                hardware: '',
                edgeband: ''
            },
            addons: []
        };

        // Merge the saved data into roomData
        Object.assign(roomData, room.data || {});

        // Create a container for this room's add-ons
        let roomAddonsContainer = document.getElementById(`room-addons-${roomId}`);
        if (!roomAddonsContainer) {
            roomAddonsContainer = document.createElement('div');
            roomAddonsContainer.id = `room-addons-${roomId}`;
            roomAddonsContainer.className = 'active-addons';
            
            // Append the container to the addon-section
            const addonSection = document.querySelector('.addon-section');
            if (addonSection) {
                addonSection.appendChild(roomAddonsContainer);
            }
        }

        // Load add-ons for this room
        if (Array.isArray(roomData.addons)) {
            roomData.addons.forEach(addonData => {
                const addon = ADDONS[addonData.key];
                if (addon) {
                    // Add add-on to the ROOM'S container
                    addAddonToRoom(roomId, addon, addonData.value, addonData.linearFeet, roomAddonsContainer);
                }
            });
        }

        localStorage.setItem(roomId, JSON.stringify(roomData));
    });

    // 3. Update current room ID
    currentRoomId = 'room-1';

    // 4. Update UI *after* saving room data
    document.getElementById('quote-id').value = quote.id;
    document.getElementById('tax-type').value = quote.taxType;
    document.getElementById('installation-type').value = quote.installationType;
    document.getElementById('installation-surcharge').value = quote.installationSurcharge || '0.00';
    document.getElementById('discount').value = quote.discount || '0.00';
    document.getElementById('project-name').value = quote.projectName;

    // 5. Initialize room selector and load first room
    initializeRoomSelector();
    loadRoomData(currentRoomId);

    // 6. Show the quote form *without* clearing data
    showCreateQuote(false);
}

function loadRoomData(roomId) {
    console.log('Loading room data for:', roomId);

    // Reset form fields
    setWallMeasurements('base', []);
    setWallMeasurements('upper', []);

    // Load the saved data
    const savedData = localStorage.getItem(roomId);
    console.log('Loaded room data from storage:', savedData);

    const defaultRoomData = {
        dimensions: {
            base: { wallA: '', wallB: '', wallC: '', wallD: '' },
            upper: { wallA: '', wallB: '', wallC: '', wallD: '' }
        },
        options: {
            "Box Construction": '',
            "Box Material": '',
            "Door Material": '',
            "Door Style": '',
            "Finish": '',
            "Interior Finish": '',
            "Drawer Box": '',
            "Drawer Style": '',
            "Hardware": '',
            "Edgeband": ''
        }
    };

    const roomData = savedData ? JSON.parse(savedData) : defaultRoomData;
    console.log('Using room data:', roomData);

    // Set dimensions
    if (roomData.dimensions) {
        // Set base walls
        if (roomData.dimensions.base) {
            document.getElementById('base-wall-a').value = roomData.dimensions.base.wallA || '';
            document.getElementById('base-wall-b').value = roomData.dimensions.base.wallB || '';
            document.getElementById('base-wall-c').value = roomData.dimensions.base.wallC || '';
            document.getElementById('base-wall-d').value = roomData.dimensions.base.wallD || '';
        }
        
        // Set upper walls
        if (roomData.dimensions.upper) {
            document.getElementById('upper-wall-a').value = roomData.dimensions.upper.wallA || '';
            document.getElementById('upper-wall-b').value = roomData.dimensions.upper.wallB || '';
            document.getElementById('upper-wall-c').value = roomData.dimensions.upper.wallC || '';
            document.getElementById('upper-wall-d').value = roomData.dimensions.upper.wallD || '';
        }
    }

    // Show/hide add-ons containers based on the current room
    document.querySelectorAll('[id^="room-addons-"]').forEach(container => {
        container.style.display = container.id === `room-addons-${roomId}` ? 'block' : 'none';
    });

    // Set options
    setSelectedOptions(roomData.options || {});

    // Update room name
    const roomIndex = parseInt(roomId.replace('room-', '')) - 1;
    document.getElementById('room-name').value = rooms[roomIndex];

    // Update calculations
    updateLinearFootage();
    updateCostBreakdown();
}

function calculateTax() {
    const taxType = document.getElementById('tax-type').value;
    const projectSubtotal = calculateProjectSubtotal();
    const addonsCost = calculateAddonsCost();
    return taxType === 'AZ' ? (projectSubtotal + addonsCost) * 0.086 : 0;
}

function calculateFinalTotal() {
    const projectSubtotal = calculateProjectSubtotal();
    const addonsCost = calculateAddonsCost();
    const tax = calculateTax();
    const installationCost = calculateTotalInstallationCost();
    const discount = parseFloat(document.getElementById('discount').value) || 0;
    return projectSubtotal + addonsCost + tax + installationCost - discount;
}

function setLoadingState(isLoading) {
    const saveButton = document.querySelector('#saveQuoteModal .save-button');
    if (saveButton) {
        saveButton.disabled = isLoading;
        saveButton.textContent = isLoading ? 'Saving...' : 'Save';
    }

    // Optional: Add visual feedback
    const modal = document.getElementById('saveQuoteModal');
    if (modal) {
        modal.style.cursor = isLoading ? 'wait' : 'default';
    }
}
