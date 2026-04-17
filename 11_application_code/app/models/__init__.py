"""
app/models/__init__.py
Teivaka Agri-TOS — SQLAlchemy 2.0 async ORM model registry
All models exported here for clean imports throughout the application.
"""

from app.models.shared import (
    Production,
    ProductionThreshold,
    ProductionStage,
    FamilyPolicy,
    RotationRegistry,
    RotationTopChoice,
    ChemicalLibrary,
    ActionableRule,
    KBArticle,
    KBStageLink,
)
from app.models.tenant import (
    Tenant,
    User,
    Farm,
    Zone,
    ProductionUnit,
    Worker,
    Supplier,
    Customer,
    Equipment,
)
from app.models.operations import (
    ProductionCycle,
    FieldEvent,
    HarvestLog,
    IncomeLog,
    LaborAttendance,
    WeatherLog,
)
from app.models.inventory import (
    Input,
    InputTransaction,
    Order,
    OrderLineItem,
    CashLedger,
    DeliveryLog,
    NurseryLog,
    HarvestLoss,
)
from app.models.financial import (
    CycleFinancials,
    ProfitShare,
    AccountsReceivable,
    PriceMaster,
)
from app.models.automation import (
    AutomationRule,
    TaskQueue,
    Alert,
    DecisionSignalConfig,
    DecisionSignalSnapshot,
)
from app.models.livestock import (
    LivestockRegister,
    HiveRegister,
)
from app.models.ai_models import (
    AICommand,
    TISConversation,
    TISVoiceLog,
    KBEmbedding,
)

__all__ = [
    # shared
    "Production",
    "ProductionThreshold",
    "ProductionStage",
    "FamilyPolicy",
    "RotationRegistry",
    "RotationTopChoice",
    "ChemicalLibrary",
    "ActionableRule",
    "KBArticle",
    "KBStageLink",
    # tenant core
    "Tenant",
    "User",
    "Farm",
    "Zone",
    "ProductionUnit",
    "Worker",
    "Supplier",
    "Customer",
    "Equipment",
    # operations
    "ProductionCycle",
    "FieldEvent",
    "HarvestLog",
    "IncomeLog",
    "LaborAttendance",
    "WeatherLog",
    # inventory
    "Input",
    "InputTransaction",
    "Order",
    "OrderLineItem",
    "CashLedger",
    "DeliveryLog",
    "NurseryLog",
    "HarvestLoss",
    # financial
    "CycleFinancials",
    "ProfitShare",
    "AccountsReceivable",
    "PriceMaster",
    # automation
    "AutomationRule",
    "TaskQueue",
    "Alert",
    "DecisionSignalConfig",
    "DecisionSignalSnapshot",
    # livestock
    "LivestockRegister",
    "HiveRegister",
    # AI / TIS
    "AICommand",
    "TISConversation",
    "TISVoiceLog",
    "KBEmbedding",
]
