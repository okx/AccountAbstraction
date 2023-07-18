// SPDX-License-Identifier: LGPL-3.0-only
pragma solidity ^0.8.12;

import "../common/SelfAuthorized.sol";

/// @title Fallback Manager - A contract that manages fallback calls made to this contract
contract FallbackManager is SelfAuthorized {
    event ChangedFallbackHandler(address handler);

    // keccak256("fallback_manager.handler.address")
    bytes32 internal constant FALLBACK_HANDLER_STORAGE_SLOT =
        0x6c9a6c4a39284e37ed1cf53d337577d14212a4870fb976a4366c693b939918d5;

    function getFallbackHandler()
        public
        view
        returns (address fallbackHandler)
    {
        bytes32 slot = FALLBACK_HANDLER_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let encoded := sload(slot)
            fallbackHandler := shr(96, encoded)
        }
    }

    /// @dev Allows to add a contract to handle fallback calls.
    ///      Only fallback calls without value and with data will be forwarded.
    ///      This can only be done via a Safe transaction.
    /// @param handler contract to handle fallbacks calls.
    function setFallbackHandler(address handler) external authorized {
        setFallbackHandler(handler, false);
        emit ChangedFallbackHandler(handler);
    }

    function setFallbackHandler(address handler, bool delegate) internal {
        bytes32 slot = FALLBACK_HANDLER_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let encoded := or(shl(96, handler), delegate)
            sstore(slot, encoded)
        }
    }

    function initializeFallbackHandler(address handler) internal {
        bytes32 slot = FALLBACK_HANDLER_STORAGE_SLOT;
        // solhint-disable-next-line no-inline-assembly
        assembly {
            let encoded := shl(96, handler)
            sstore(slot, encoded)
        }
    }

    // solhint-disable-next-line payable-fallback,no-complex-fallback
    fallback() external {
        assembly {
            // Load handler and delegate flag from storage
            let encoded := sload(FALLBACK_HANDLER_STORAGE_SLOT)
            let handler := shr(96, encoded)
            let delegate := and(encoded, 1)

            // Copy calldata to memory
            calldatacopy(0, 0, calldatasize())

            // If delegate flag is set, delegate the call to the handler
            switch delegate
            case 0 {
                mstore(calldatasize(), shl(96, caller()))
                let success := call(
                    gas(),
                    handler,
                    0,
                    0,
                    add(calldatasize(), 20),
                    0,
                    0
                )
                returndatacopy(0, 0, returndatasize())
                if iszero(success) {
                    revert(0, returndatasize())
                }
                return(0, returndatasize())
            }
            case 1 {
                let result := delegatecall(
                    gas(),
                    handler,
                    0,
                    calldatasize(),
                    0,
                    0
                )

                returndatacopy(0, 0, returndatasize())

                switch result
                case 0 {
                    revert(0, returndatasize())
                }
                default {
                    return(0, returndatasize())
                }
            }
        }
    }
}
